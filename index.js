import express from "express";
import db from "./db.js";
import cors from "cors";
import bcrypt from "bcrypt";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3000;


// === REGISTER ROUTE ===
app.post("/register", async (req, res) => {
  const { username, password, full_name } = req.body;

  try {
    const existing = await db.query("SELECT * FROM users WHERE username = $1", [username]);
    if (existing.rows.length > 0) {
      return res.json({ success: false, message: "Username already exists" });
    }

    await db.query(
        "INSERT INTO users (username, password, full_name) VALUES ($1, $2, $3)",
        [username, password, full_name]
      );
      

    res.json({ success: true });
  } catch (error) {
    console.error("Registration error:", error);
    res.json({ success: false });
  }
});

// === LOGIN ROUTE ===
app.post("/login", async (req, res) => {
  const { username, password, adminCode } = req.body;

  try {
    const userRes = await db.query("SELECT * FROM users WHERE username = $1", [username]);
    const user = userRes.rows[0];

    if (!user) return res.json({ success: false });

    if (password !== user.password) return res.json({ success: false });

    let role = "user";

    if (adminCode) {
      const codeRes = await db.query("SELECT * FROM admin_code LIMIT 1");
      const hashedAdminCode = codeRes.rows[0]?.hashed_code;

      const isAdmin = await bcrypt.compare(adminCode, hashedAdminCode);
      if (isAdmin) {
        role = "admin";
        await db.query("UPDATE users SET role = $1 WHERE username = $2", [role, username]);
      }
    }

    res.json({
      success: true,
      user_id: user.user_id,
      username: user.username,  
      isAdmin: role === "admin",
    });
  } catch (error) {
    console.error("Login error:", error);
    res.json({ success: false });
  }
});



// === GET ALL BOOKS ===
app.get("/books", async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM books ORDER BY created_at DESC");
    res.json(result.rows);
  } catch (error) {
    console.error("Failed to fetch books:", error);
    res.status(500).json({ success: false });
  }
});

app.post('/delete-book', async (req, res) => {
  const { book_id } = req.body;

  if (!book_id) {
    return res.status(400).json({ message: 'Book ID is required' });
  }

  try {
    const result = await db.query('DELETE FROM books WHERE book_id = $1', [book_id]);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Book not found' });
    }

    res.status(200).json({ message: 'Book deleted successfully' });
  } catch (error) {
    console.error('Error deleting book:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});







app.post('/update-book', async (req, res) => {
  const { book_id, title, author, genre, published_year, status, quantity } = req.body;

  try {
    const result = await db.query(
      `UPDATE books SET title = $1, author = $2, genre = $3, published_year = $4, status = $5, quantity = $6 WHERE book_id = $7`,
      [title, author, genre, published_year, status, quantity, book_id] // Fix the parameter order
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Book not found" });
    }

    res.json({ message: "Book updated successfully" });
  } catch (err) {
    console.error("Error updating book:", err);
    res.status(500).json({ message: "Internal server error" });
  }
});


app.post('/add-book', async (req, res) => {
  const { title, author, genre, published_year, quantity } = req.body;

  
  const status = 'available';

  try {
    await db.query(
      `INSERT INTO books (title, author, genre, published_year, status, quantity, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [title, author, genre, published_year, status, quantity]
    );

    res.status(201).json({ message: 'Book added successfully' });
  } catch (error) {
    console.error('Error adding book:', error);
    res.status(500).json({ error: 'Failed to add book' });
  }
});


app.get('/transactions', async (req, res) => {
  try {
    const result = await db.query(`
      SELECT 
        t.transaction_id,
        t.user_id,
        u.username,
        b.title AS book_title,
        t.quantity,
        t.action,
        t.borrow_date,
        t.return_date,
        t.timestamp
      FROM transactions t
      JOIN users u ON t.user_id = u.user_id
      JOIN books b ON t.book_id = b.book_id
      ORDER BY t.timestamp DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});


app.get('/borrowed-books/:username', async (req, res) => {
  const { username } = req.params;

  try {
    // First get the user_id from username
    const userRes = await db.query(
      `SELECT user_id FROM users WHERE username = $1`,
      [username]
    );

    if (userRes.rows.length === 0) {
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const user_id = userRes.rows[0].user_id;

    // Then get borrowed books by user_id
    const borrowedBooks = await db.query(
      `SELECT b.title, bb.book_id, bb.borrow_id, bb.borrow_date, bb.return_date, bb.is_returned, bb.quantity
       FROM borrowed_books bb
       JOIN books b ON bb.book_id = b.book_id
       WHERE bb.user_id = $1`,
      [user_id]
    );

    res.json({ success: true, borrowedBooks: borrowedBooks.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, error: 'Database error' });
  }
});




app.post('/borrow-book', async (req, res) => {
  const { username, book_id, return_date, quantity} = req.body;

  try {
    
    const userRes = await db.query(
      `SELECT user_id, is_locked FROM users WHERE username = $1`,
      [username]
    );
    const user = userRes.rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });

   
    const borrowedRes = await db.query(
      `SELECT COUNT(*) FROM borrowed_books 
       WHERE user_id = $1 AND is_returned = false`,
      [user.user_id]
    );
    const unreturnedCount = parseInt(borrowedRes.rows[0].count, 10);

    
    if (user.is_locked && unreturnedCount < 2) {
      await db.query(`UPDATE users SET is_locked = false WHERE user_id = $1`, [user.user_id]);
      user.is_locked = false;
    }

    if (user.is_locked) {
      return res.status(403).json({ error: 'Account is locked' });
    }

    
    if (unreturnedCount >= 2) {
      await db.query(`UPDATE users SET is_locked = true WHERE user_id = $1`, [user.user_id]);
      await db.query(
        `INSERT INTO transactions (user_id, book_id, action, username)
         VALUES ($1, $2, 'locked', $3)`,
        [user.user_id, book_id, username]
      );
      return res.status(403).json({ error: 'Account locked due to 2 unreturned books' });
    }

    
    const bookRes = await db.query(`SELECT quantity FROM books WHERE book_id = $1`, [book_id]);
    if (!bookRes.rows.length) {
      return res.status(400).json({ error: 'Book not found' });
    }

    const currentQty = bookRes.rows[0].quantity;
    if (currentQty <= 0) {
      return res.status(400).json({ error: 'Book is out of stock' });
    }

    const borrowDate = new Date().toISOString();
    

    
    await db.query(
      `INSERT INTO borrowed_books (user_id, book_id, return_date, username, quantity)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.user_id, book_id, return_date, username, quantity]
    );

    
    await db.query(
      `INSERT INTO transactions (
         user_id, book_id, action, username, borrow_date, return_date, quantity
       ) VALUES ($1, $2, 'borrowed', $3, $4, $5, $6)`,
      [user.user_id, book_id, username, borrowDate, return_date, quantity]
    );

    
    await db.query(
      `UPDATE books SET quantity = quantity - $1 WHERE book_id = $2`,
      [quantity, book_id]
    );

    res.json({ success: true, accountLocked: unreturnedCount + 1 === 2 });
  } catch (err) {
    console.error("Error borrowing book:", err);
    res.status(500).json({ error: 'Server error' });
  }
});


app.post('/return-book', async (req, res) => {
  const { borrow_id } = req.body;

  try {
    
    const borrowRes = await db.query(
      `UPDATE borrowed_books 
       SET is_returned = true 
       WHERE borrow_id = $1 
       RETURNING user_id, book_id, quantity, borrow_date`,
      [borrow_id]
    );

    const { user_id, book_id, quantity } = borrowRes.rows[0];

   
    await db.query(
      `UPDATE books 
       SET quantity = quantity + $1 
       WHERE book_id = $2`,
      [quantity, book_id]
    );

   
    await db.query(
      `UPDATE transactions
       SET action = 'returned', return_date = NOW()
       WHERE ctid IN (
         SELECT ctid FROM transactions
         WHERE user_id = $1 AND book_id = $2 AND action = 'borrowed'
         ORDER BY timestamp DESC
         LIMIT 1
       )`,
      [user_id, book_id]
    );
    

   
    const checkRes = await db.query(
      `SELECT COUNT(*) FROM borrowed_books 
       WHERE user_id = $1 AND is_returned = false`,
      [user_id]
    );

    if (parseInt(checkRes.rows[0].count) === 0) {
      await db.query(`UPDATE users SET is_locked = false WHERE user_id = $1`, [user_id]);
      
    }

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on PORT ${PORT}`);
});
