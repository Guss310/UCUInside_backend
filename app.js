const express = require("express");
const mysql = require('mysql2');
const dotenv= require('dotenv');
const multer = require('multer');
const port = 3001;
const cors = require('cors');



dotenv.config( {path: './.env'} ); 

const app = express();
const router = express.Router();

app.use(cors()); // para esto tengo que instalar 

// Configure express to use body-parser as middle-ware.
const bodyParser = require('body-parser');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));


app.get("/", (req, res) => {
    res.send("<h1>Hello World!</h1>");
    }
);

app.listen(port, '0.0.0.0', () => {
    console.log("Server is running on port 3001");
    }
);

const connection = mysql.createConnection({ // 
  host: process.env.DATABASE_HOST,
  user: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  database: process.env.DATABASE,
});

connection.connect((error) => {
  if (error) {
    console.log(error);
  } else {
    console.log("MySQL connected");
  }
});


// function to execute a query
function executeQuery(query, res) { 
  connection.query(query, (err, results) => {
    if (err) {
    throw err;
    }
    return results;
  });
}

// function to exceute a query without response
function executeQueryNoResponse(query) {
  return new Promise((resolve, reject) => {
    connection.query(query, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

// user_vote schema 

async function getUserVote(userId, postId, commentId) {
  const query = `SELECT * FROM user_votes WHERE user_id = ? AND ${postId ? 'post_id = ?' : 'comment_id = ?'}`;
  const params = [userId, postId || commentId];
  const [rows] = await connection.promise().query(query, params);
  return rows[0];
}

async function updateUserVote(userId, postId, commentId, voteType) {
  const query = `
    INSERT INTO user_votes (user_id, post_id, comment_id, vote_type)
    VALUES (?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE vote_type = ?
  `;
  const params = [userId, postId, commentId, voteType, voteType];
  await connection.promise().query(query, params);
}

async function deleteUserVote(userId, postId, commentId) {
  const query = `DELETE FROM user_votes WHERE user_id = ? AND ${postId ? 'post_id = ?' : 'comment_id = ?'}`;
  const params = [userId, postId || commentId];
  await connection.promise().query(query, params);
}






// Post schema
// { id, postcontent , topic, votes, created_at, image, author}

async function getPostsQuery(vote_order) {
  // Query to get posts
  const postQuery = `SELECT * FROM post ORDER BY votes ${vote_order}`;
  
  // Query to get comments
  const commentsQuery = `SELECT * FROM comments ORDER BY votes ${vote_order}`;

  const posts = await executeQueryNoResponse(postQuery);
  const comments = await executeQueryNoResponse(commentsQuery);

  // Add comments to posts
  const postsWithComments = posts.map(post => {
    post.comments = comments.filter(comments => comments.post_id === post.id);
    return post;
  }); 
  return postsWithComments;
}

// Get all posts
router.get('/post/:vote_order', async (req, res) => {
  console.log("Get all posts")
  const posts = await getPostsQuery(req.params.vote_order);
  res.send(posts);
  return posts;

});

// Get post by id
router.get('/post/:id', async (req, res) => {
  const query = `SELECT * FROM post WHERE id = ${req.params.id}`;
  executeQuery(query, res);
});

// Create a new post
router.post('/post', (req, res) => {
  const { postcontent, topic, author, user_id } = req.body;
  console.log("create a new post:", req.body);

  const query = `INSERT INTO post (postcontent, topic, author, votes, user_id) VALUES (?, ?, ?, 0, ?)`;

  connection.query(query, [postcontent, topic, author, user_id], (err, results) => {
    if (err) {
      throw err;
    }

    // Hacer una consulta para obtener el post recién creado incluyendo `votes` y `created_at`
    const selectQuery = `SELECT * FROM post WHERE id = ${results.insertId}`;

    connection.query(selectQuery, (err, rows) => {
      if (err) {
        throw err;
      }

      // Aquí `rows[0]` tendrá todos los campos del post, incluyendo `votes` y `created_at`
      const newPost = rows[0];

      console.log("Nuevo post creado:", newPost);

      res.send(newPost);
    });
  });
});


// Comment Schema
// { id, content, votes, created_at, post_id, author}

// Get all comments

router.get('/comments', (req, res) => {
  // Get comments, ordered by vote_order = 'desc' or 'asc'
  const query = `SELECT * FROM comments ORDER BY votes ${req.query.vote_order}`;
  executeQuery(query, res);
});

// Get all comments for a post param vote_order = 'desc' or 'asc'
router.get('/comments/:post_id/:vote_order', (req, res) => {
  const query = `SELECT * FROM comments WHERE post_id = ${req.params.post_id} ORDER BY votes ${req.query.vote_order}`;
  executeQuery(query, res);
});

// Post a new comment
router.post('/comments', (req, res) => {
  const { content, post_id, author } = req.body;
  console.log(req.body);
  const query = `INSERT INTO comments (content, post_id, votes) VALUES ('${content}', ${post_id}, 0)`;
  executeQuery(query, res);
  res.send(req.body);
});

// Vote for a post
router.put('/vote/post/:id/:vote', async (req, res) => {
  const query = `UPDATE post SET votes = votes ${req.params.vote === 'up' ? '+ 1' : '- 1'} WHERE id = ${req.params.id}`;
  executeQuery(query, res);

  const posts = await getPostsQuery("DESC");
  res.send(posts);
});

// vote for a comment
router.put('/vote/comments/:id/:vote', async (req, res) => {
  const query = `UPDATE comments SET votes = votes ${req.params.vote === 'up' ? '+ 1' : '- 1'} WHERE id = ${req.params.id}`;
  executeQueryNoResponse(query);

  // Retrieve again all the comments
  const comments = 'SELECT * FROM comments ORDER BY votes ASC'; 
  const posts = await getPostsQuery("DESC");
  res.send(posts)

});




app.use('/api/', router); 

