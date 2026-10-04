const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const OpenAI = require("openai");
const session = require("express-session");
const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/* =========================
   SIMPLE JSON DATABASE
========================= */

const DATA_FILE = path.join(__dirname, "smart-helper-data.json");

function loadData() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      return {
        users: [],
        chats: [],
        nextUserId: 1,
        nextChatId: 1
      };
    }

    return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
  } catch (error) {
    console.error("DATABASE LOAD ERROR:", error);

    return {
      users: [],
      chats: [],
      nextUserId: 1,
      nextChatId: 1
    };
  }
}

let data = loadData();

function saveData() {
  fs.writeFileSync(
    DATA_FILE,
    JSON.stringify(data, null, 2),
    "utf8"
  );
}

/* =========================
   MIDDLEWARE
========================= */

app.use(cors({
  origin: true,
  credentials: true
}));

app.use(express.json());

app.use(express.static(__dirname));

/* =========================
   SESSION
========================= */

app.use(session({
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

/* =========================
   HOME
========================= */

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
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

    const cleanName = String(name).trim();
    const cleanEmail = String(email).trim().toLowerCase();

    const existingUser = data.users.find(
      user => user.email === cleanEmail
    );

    if (existingUser) {
      return res.status(400).json({
        error: "An account with this email already exists"
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = {
      id: data.nextUserId++,
      name: cleanName,
      email: cleanEmail,
      password: hashedPassword,
      created_at: new Date().toISOString()
    };

    data.users.push(user);

    saveData();

    req.session.userId = user.id;

    req.session.save(error => {
      if (error) {
        console.error("SESSION SAVE ERROR:", error);

        return res.status(500).json({
          error: "Could not save login session"
        });
      }

      res.json({
        success: true,
        message: "Account created successfully",

        user: {
          id: user.id,
          name: user.name,
          email: user.email
        }
      });
    });

  } catch (error) {
    console.error("SIGNUP ERROR:", error);

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
        error: "Email and password are required"
      });
    }

    const cleanEmail = String(email).trim().toLowerCase();

    const user = data.users.find(
      item => item.email === cleanEmail
    );

    if (!user) {
      return res.status(401).json({
        error: "Invalid email or password"
      });
    }

    const passwordMatch = await bcrypt.compare(
      password,
      user.password
    );

    if (!passwordMatch) {
      return res.status(401).json({
        error: "Invalid email or password"
      });
    }

    req.session.userId = user.id;

    req.session.save(error => {
      if (error) {
        console.error("SESSION SAVE ERROR:", error);

        return res.status(500).json({
          error: "Could not save login session"
        });
      }

      res.json({
        success: true,
        message: "Login successful",

        user: {
          id: user.id,
          name: user.name,
          email: user.email
        }
      });
    });

  } catch (error) {
    console.error("LOGIN ERROR:", error);

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

  const user = data.users.find(
    item => item.id === req.session.userId
  );

  if (!user) {

    req.session.destroy(() => {});

    return res.json({
      loggedIn: false
    });
  }

  res.json({
    loggedIn: true,

    user: {
      id: user.id,
      name: user.name,
      email: user.email
    }
  });
});

/* =========================
   LOGOUT
========================= */

app.post("/logout", (req, res) => {

  req.session.destroy(error => {

    if (error) {
      return res.status(500).json({
        error: "Logout failed"
      });
    }

    res.clearCookie("connect.sid");

    res.json({
      success: true,
      message: "Logged out successfully"
    });
  });
});

/* =========================
   ASK AI
========================= */

app.post("/ask", requireLogin, async (req, res) => {

  try {

    const message =
      req.body.message ||
      req.body.text ||
      req.body.prompt ||
      req.body.input ||
      "";

    if (!String(message).trim()) {
      return res.status(400).json({
        error: "Message is required"
      });
    }

    const response = await client.responses.create({
      model: "gpt-5-mini",
      input: message
    });

    const reply = response.output_text || "";

    data.chats.push({
      id: data.nextChatId++,
      user_id: req.session.userId,
      message: String(message),
      reply: String(reply),
      created_at: new Date().toISOString()
    });

    saveData();

    res.json({
      reply
    });

  } catch (error) {

    console.error("ASK ERROR:", error);

    res.status(500).json({
      error: error.message || "AI request failed"
    });
  }
});

/* =========================
   REWRITE
========================= */

app.post("/rewrite", requireLogin, async (req, res) => {

  try {

    const text =
      req.body.text ||
      req.body.message ||
      req.body.prompt ||
      req.body.input ||
      "";

    if (!String(text).trim()) {
      return res.status(400).json({
        error: "Text is required"
      });
    }

    const response = await client.responses.create({

      model: "gpt-5-mini",

      instructions:
        "You are a professional writing assistant. Rewrite the user's text so it sounds clear, natural, polished and professional. Keep the original meaning. Do not explain the changes. Return ONLY the rewritten text.",

      input: text
    });

    const rewritten =
      response.output_text || "";

    data.chats.push({
      id: data.nextChatId++,
      user_id: req.session.userId,
      message: "Rewrite: " + String(text),
      reply: String(rewritten),
      created_at: new Date().toISOString()
    });

    saveData();

    res.json({
      reply: rewritten,
      rewritten: rewritten
    });

  } catch (error) {

    console.error("REWRITE ERROR:", error);

    res.status(500).json({
      error: error.message || "Rewrite failed"
    });
  }
});

/* =========================
   TRANSLATE
========================= */

app.post("/translate", requireLogin, async (req, res) => {

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

    if (!String(text).trim()) {
      return res.status(400).json({
        error: "Text is required"
      });
    }

    if (!String(language).trim()) {
      return res.status(400).json({
        error: "Language is required"
      });
    }

    const response = await client.responses.create({

      model: "gpt-5-mini",

      instructions:
        `You are a professional translator. Translate the user's text into ${language}. Preserve the exact meaning and context. Do not explain anything. Return ONLY the translated text.`,

      input: text
    });

    res.json({
      translation:
        (response.output_text || "").trim()
    });

  } catch (error) {

    console.error("TRANSLATION ERROR:", error);

    res.status(500).json({
      error: error.message || "Translation failed"
    });
  }
});

/* =========================
   CHAT HISTORY
========================= */

app.get("/history", requireLogin, (req, res) => {

  try {

    const chats = data.chats
      .filter(
        chat => chat.user_id === req.session.userId
      )
      .sort(
        (a, b) => b.id - a.id
      )
      .slice(0, 100);

    res.json({
      chats
    });

  } catch (error) {

    console.error("HISTORY ERROR:", error);

    res.status(500).json({
      error: "Could not load chat history"
    });
  }
});

/* =========================
   DELETE HISTORY
========================= */

app.delete("/history", requireLogin, (req, res) => {

  try {

    data.chats = data.chats.filter(
      chat => chat.user_id !== req.session.userId
    );

    saveData();

    res.json({
      success: true,
      message: "Chat history deleted"
    });

  } catch (error) {

    console.error("DELETE HISTORY ERROR:", error);

    res.status(500).json({
      error: "Could not delete history"
    });
  }
});

/* =========================
   SERVER START
========================= */

app.listen(PORT, "0.0.0.0", () => {

  console.log("");
  console.log("======================================");
  console.log("   SMART HELPER SERVER IS RUNNING");
  console.log("   PORT: " + PORT);
  console.log("   JSON DATABASE: smart-helper-data.json");
  console.log("======================================");
  console.log("");
});