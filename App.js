const chatBox = document.getElementById("chatBox");
const messageInput = document.getElementById("messageInput");
const sendButton = document.getElementById("sendButton");
const historyBox = document.getElementById("historyBox");
const historyList = document.getElementById("historyList");
const clearHistoryButton = document.getElementById("clearHistoryButton");

// =========================
// SEND CHAT MESSAGE
// =========================

async function sendMessage() {
  const message = messageInput.value.trim();

  if (!message) {
    return;
  }

  // Show user message
  addMessage("user", message);

  messageInput.value = "";
  sendButton.disabled = true;
  sendButton.innerText = "Thinking...";

  // Loading message
  const loading = document.createElement("div");
  loading.className = "message assistant loading";
  loading.innerText = "Smart Helper is thinking...";
  chatBox.appendChild(loading);

  chatBox.scrollTop = chatBox.scrollHeight;

  try {
    const response = await fetch("/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: message,
      }),
    });

    const data = await response.json();

    loading.remove();

    if (!response.ok) {
      addMessage(
        "assistant",
        data.error || "Something went wrong."
      );
      return;
    }

    addMessage("assistant", data.reply);

    // Refresh history
    loadHistory();

  } catch (error) {
    loading.remove();

    addMessage(
      "assistant",
      "Server se connection nahi ho raha. Please check that server.js is running."
    );

    console.error(error);
  }

  sendButton.disabled = false;
  sendButton.innerText = "Send";
}

// =========================
// ADD MESSAGE TO CHAT
// =========================

function addMessage(type, text) {
  const message = document.createElement("div");

  message.className =
    type === "user"
      ? "message user"
      : "message assistant";

  message.innerText = text;

  chatBox.appendChild(message);

  chatBox.scrollTop = chatBox.scrollHeight;
}

// =========================
// ENTER KEY
// =========================

messageInput.addEventListener("keydown", function (event) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendMessage();
  }
});

// =========================
// SEND BUTTON
// =========================

sendButton.addEventListener("click", sendMessage);

// =========================
// LOAD HISTORY
// =========================

async function loadHistory() {
  try {
    const response = await fetch("/history");

    const history = await response.json();

    historyList.innerHTML = "";

    if (!history.length) {
      historyList.innerHTML =
        '<p class="empty-history">No chat history yet.</p>';
      return;
    }

    history
      .slice()
      .reverse()
      .forEach((item) => {
        const historyItem = document.createElement("div");

        historyItem.className = "history-item";

        historyItem.innerHTML = `
          <div class="history-question">
            ${escapeHTML(item.user)}
          </div>

          <div class="history-answer">
            ${escapeHTML(item.assistant)}
          </div>

          <div class="history-time">
            ${escapeHTML(item.time)}
          </div>
        `;

        historyItem.addEventListener("click", function () {
          chatBox.innerHTML = "";

          addMessage("user", item.user);
          addMessage("assistant", item.assistant);

          closeHistory();
        });

        historyList.appendChild(historyItem);
      });

  } catch (error) {
    console.error("History error:", error);
  }
}

// =========================
// OPEN HISTORY
// =========================

function openHistory() {
  historyBox.classList.add("show");

  loadHistory();
}

// =========================
// CLOSE HISTORY
// =========================

function closeHistory() {
  historyBox.classList.remove("show");
}

// =========================
// CLEAR HISTORY
// =========================

clearHistoryButton.addEventListener("click", async function () {
  const confirmClear = confirm(
    "Are you sure you want to clear all chat history?"
  );

  if (!confirmClear) {
    return;
  }

  try {
    await fetch("/history", {
      method: "DELETE",
    });

    historyList.innerHTML =
      '<p class="empty-history">No chat history yet.</p>';

    chatBox.innerHTML = "";

  } catch (error) {
    console.error(error);
  }
});

// =========================
// ESCAPE HTML
// =========================

function escapeHTML(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// =========================
// START
// =========================

loadHistory();