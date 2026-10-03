const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const OpenAI = require("openai");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

const db = new Database("smart-helper.db");

db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS chats (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    message TEXT NOT NULL,
    reply TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );
`);


/* ========================= */
   MIDDLEWARE
========================= */

app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json());

app.use(express.static(__dirname));


/* =========================
   PERSISTENT SESSION
========================= */

app.use(session({

  store: new SQLiteStore({
    db: "sessions.db",
    dir: __dirname,
    table: "sessions"
  }),

  secret:
    process.env.SESSION_SECRET ||
    "smart-helper-permanent-secret-2026",

  resave: false,

  saveUninitialized: false,

  rolling: true,

  cookie: {

    httpOnly: true,

    maxAge: 1000 * 60 * 60 * 24 * 30,

    sameSite: "lax",

    secure: false

  }

}));


app.get("/", (req, res) => {

  res.sendFile(__dirname + "/index.html");

});


/* =========================
   LOGIN CHECK
========================= */

function requireLogin(req, res, next) {

  if (!req.session.userId) {

    return res.status(401).json({
      error: "Please login first"
    });

  }

  next();

}


/* =========================
   SIGNUP
========================= */

app.post("/signup", async (req, res) => {

  try {

    const {
      name,
      email,
      password
    } = req.body;

    if (!name || !email || !password) {

      return res.status(400).json({
        error: "Name, email and password are required"
      });

    }

    if (password.length < 6) {

      return res.status(400).json({
        error: "Password must be at least 6 characters"
      });

    }

    const cleanName =
      name.trim();

    const cleanEmail =
      email.trim().toLowerCase();


    const existingUser =
      db.prepare(
        "SELECT id FROM users WHERE email = ?"
      ).get(cleanEmail);


    if (existingUser) {

      return res.status(400).json({
        error:
          "An account with this email already exists"
      });

    }


    const hashedPassword =
      await bcrypt.hash(password, 10);


    const result =
      db.prepare(`
        INSERT INTO users
        (name, email, password)
        VALUES (?, ?, ?)
      `).run(
        cleanName,
        cleanEmail,
        hashedPassword
      );


    req.session.userId =
      Number(result.lastInsertRowid);


    res.json({

      success: true,

      message:
        "Account created successfully",

      user: {

        id:
          Number(result.lastInsertRowid),

        name:
          cleanName,

        email:
          cleanEmail

      }

    });

  } catch (error) {

    console.error(
      "SIGNUP ERROR:",
      error
    );

    res.status(500).json({
      error: "Could not create account"
    });

  }

});


/* =========================
   LOGIN
========================= */

app.post("/login", async (req, res) => {

  try {

    const {
      email,
      password
    } = req.body;


    if (!email || !password) {

      return res.status(400).json({
        error:
          "Email and password are required"
      });

    }


    const cleanEmail =
      email.trim().toLowerCase();


    const user =
      db.prepare(
        "SELECT * FROM users WHERE email = ?"
      ).get(cleanEmail);


    if (!user) {

      return res.status(401).json({
        error:
          "Invalid email or password"
      });

    }


    const passwordMatch =
      await bcrypt.compare(
        password,
        user.password
      );


    if (!passwordMatch) {

      return res.status(401).json({
        error:
          "Invalid email or password"
      });

    }


    req.session.userId =
      user.id;


    req.session.save((error) => {

      if (error) {

        console.error(
          "SESSION SAVE ERROR:",
          error
        );

        return res.status(500).json({
          error:
            "Could not save login session"
        });

      }


      res.json({

        success: true,

        message:
          "Login successful",

        user: {

          id:
            user.id,

          name:
            user.name,

          email:
            user.email

        }

      });

    });

  } catch (error) {

    console.error(
      "LOGIN ERROR:",
      error
    );

    res.status(500).json({
      error: "Login failed"
    });

  }

});


/* =========================
   CURRENT USER
========================= */

app.get("/me", (req, res) => {

  if (!req.session.userId) {

    return res.json({
      loggedIn: false
    });

  }


  const user =
    db.prepare(`
      SELECT
        id,
        name,
        email
      FROM users
      WHERE id = ?
    `).get(
      req.session.userId
    );


  if (!user) {

    req.session.destroy(() => {});

    return res.json({
      loggedIn: false
    });

  }


  res.json({

    loggedIn: true,

    user

  });

});


/* =========================
   LOGOUT
========================= */

app.post("/logout", (req, res) => {

  req.session.destroy((error) => {

    if (error) {

      return res.status(500).json({
        error: "Logout failed"
      });

    }


    res.clearCookie("connect.sid");


    res.json({

      success: true,

      message:
        "Logged out successfully"

    });

  });

});


/* =========================
   ASK AI
========================= */

app.post(
  "/ask",
  requireLogin,
  async (req, res) => {

    try {

      const message =
        req.body.message ||
        req.body.text ||
        req.body.prompt ||
        req.body.input ||
        "";


      if (!message.trim()) {

        return res.status(400).json({
          error:
            "Message is required"
        });

      }


      const response =
        await client.responses.create({

          model:
            "gpt-5-mini",

          input:
            message

        });


      const reply =
        response.output_text || "";


      db.prepare(`
        INSERT INTO chats
        (user_id, message, reply)
        VALUES (?, ?, ?)
      `).run(
        req.session.userId,
        message,
        reply
      );


      res.json({
        reply
      });

    } catch (error) {

      console.error(
        "ASK ERROR:",
        error
      );

      res.status(500).json({
        error:
          error.message ||
          "AI request failed"
      });

    }

  }
);


/* =========================
   REWRITE
========================= */

app.post(
  "/rewrite",
  requireLogin,
  async (req, res) => {

    try {

      const text =
        req.body.text ||
        req.body.message ||
        req.body.prompt ||
        req.body.input ||
        "";


      if (!text.trim()) {

        return res.status(400).json({
          error:
            "Text is required"
        });

      }


      const response =
        await client.responses.create({

          model:
            "gpt-5-mini",

          instructions: `
You are a professional writing assistant.

Rewrite the user's text so it sounds clear,
natural, polished and professional.

Keep the original meaning.

Do not explain the changes.

Return ONLY the rewritten text.
`,

          input:
            text

        });


      const rewritten =
        response.output_text || "";


      db.prepare(`
        INSERT INTO chats
        (user_id, message, reply)
        VALUES (?, ?, ?)
      `).run(
        req.session.userId,
        "Rewrite: " + text,
        rewritten
      );


      res.json({

        reply:
          rewritten,

        rewritten:
          rewritten

      });

    } catch (error) {

      console.error(
        "REWRITE ERROR:",
        error
      );

      res.status(500).json({
        error:
          error.message ||
          "Rewrite failed"
      });

    }

  }
);


/* =========================
   TRANSLATE
========================= */

app.post(
  "/translate",
  requireLogin,
  async (req, res) => {

    try {

      const text =
        req.body.text ||
        req.body.message ||
        req.body.prompt ||
        req.body.input ||
        "";


      const language =
        req.body.language ||
        req.body.targetLanguage ||
        "";


      if (!text.trim()) {

        return res.status(400).json({
          error:
            "Text is required"
        });

      }


      if (!language.trim()) {

        return res.status(400).json({
          error:
            "Language is required"
        });

      }


      const response =
        await client.responses.create({

          model:
            "gpt-5-mini",

          instructions: `
You are a professional translator.

Translate the user's text into ${language}.

Preserve the exact meaning and context.

Do not explain anything.

Return ONLY the translated text.
`,

          input:
            text

        });


      res.json({

        translation:
          response.output_text.trim()

      });

    } catch (error) {

      console.error(
        "TRANSLATION ERROR:",
        error
      );

      res.status(500).json({
        error:
          error.message ||
          "Translation failed"
      });

    }

  }
);


/* =========================
   CHAT HISTORY
========================= */

app.get(
  "/history",
  requireLogin,
  (req, res) => {

    try {

      const chats =
        db.prepare(`
          SELECT
            id,
            message,
            reply,
            created_at
          FROM chats
          WHERE user_id = ?
          ORDER BY id DESC
          LIMIT 100
        `).all(
          req.session.userId
        );


      res.json({
        chats
      });

    } catch (error) {

      console.error(
        "HISTORY ERROR:",
        error
      );

      res.status(500).json({
        error:
          "Could not load chat history"
      });

    }

  }
);


/* =========================
   DELETE HISTORY
========================= */

app.delete(
  "/history",
  requireLogin,
  (req, res) => {

    try {

      db.prepare(`
        DELETE FROM chats
        WHERE user_id = ?
      `).run(
        req.session.userId
      );


      res.json({

        success: true,

        message:
          "Chat history deleted"

      });

    } catch (error) {

      console.error(
        "DELETE HISTORY ERROR:",
        error
      );

      res.status(500).json({
        error:
          "Could not delete history"
/* =========================
   SERVER START
========================= */

/* =========================
   SERVER START
========================= */

app.listen(
  PORT,
  "0.0.0.0",
  () => {

    console.log("");
    console.log(
      "======================================"
    );
    console.log(
      "   SMART HELPER SERVER IS RUNNING"
    );
    console.log(
      "   http://localhost:" + PORT
    );
    console.log(
      "   Database: smart-helper.db"
    );
    console.log(
      "   Sessions: sessions.db"
    );
    console.log(
      "   Rewrite: READY"
    );
    console.log(
      "   Translate: READY"
    );
    console.log(
      "   Chat History: READY"
    );
    console.log(
      "======================================"
    );
    console.log("");

  }
);
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on port ${PORT}`);
});