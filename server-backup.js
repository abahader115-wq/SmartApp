const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const OpenAI = require("openai");

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

// ASK AI
app.post("/ask", async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({
        error: "Message is required"
      });
    }

    const response = await client.responses.create({
      model: "gpt-5-mini",
      input: message
    });

    res.json({
      reply: response.output_text
    });

  } catch (error) {
    console.error("ASK ERROR:", error);

    res.status(500).json({
      error: error.message || "AI request failed"
    });
  }
});

// TRANSLATE
app.post("/translate", async (req, res) => {
  try {
    console.log("TRANSLATE ROUTE HIT");

    const { text, language } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({
        error: "Text is required"
      });
    }

    if (!language || !language.trim()) {
      return res.status(400).json({
        error: "Language is required"
      });
    }

    const response = await client.responses.create({
      model: "gpt-5-mini",
      instructions: `You are a professional translator.
Translate the user's text into ${language}.
Preserve the exact meaning and context.
Do not explain anything.
Return ONLY the translated text.`,
      input: text
    });

    console.log("TRANSLATION SUCCESS");

    res.json({
      translation: response.output_text.trim()
    });

  } catch (error) {
    console.error("TRANSLATION ERROR:", error);

    res.status(500).json({
      error: error.message || "Translation failed"
    });
  }
});

// START SERVER
app.listen(PORT, () => {
  console.log(
    "Smart Helper AI Server is running at http://localhost:" + PORT
  );
});