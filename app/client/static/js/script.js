// Global variable to hold the session ID
let sessionId = null;

/**
 * Request a new session ID from the backend.
 */
async function getSessionId() {
  try {
    const response = await fetch("/get_session_id", { method: "POST" });
    const data = await response.json();
    sessionId = data.session_id;
    
    // Update the URL with the session ID
    window.history.pushState({}, '', '/session_id?sessionId=' + sessionId);
  } catch (error) {
    console.error("Error getting session id:", error);
  }
}


/**
 * A simple Markdown-to-HTML converter.
 * It converts bold text, ordered/unordered lists, and paragraphs.
 */
function markdownToHtml(md) {
  md = md.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  const lines = md.split('\n');
  let html = '';
  let inOrderedList = false;
  let inUnorderedList = false;
  lines.forEach(line => {
    line = line.trim();
    if (/^\d+\.\s+/.test(line)) {
      if (!inOrderedList) { html += '<ol>'; inOrderedList = true; }
      const item = line.replace(/^\d+\.\s+/, '');
      html += '<li>' + item + '</li>';
    } else if (line.startsWith('* ')) {
      if (!inUnorderedList) { html += '<ul>'; inUnorderedList = true; }
      html += '<li>' + line.substring(2) + '</li>';
    } else {
      if (inOrderedList) { html += '</ol>'; inOrderedList = false; }
      if (inUnorderedList) { html += '</ul>'; inUnorderedList = false; }
      if (line !== '') { html += '<p>' + line + '</p>'; }
    }
  });
  if (inOrderedList) { html += '</ol>'; }
  if (inUnorderedList) { html += '</ul>'; }
  return html;
}

/**
 * Get the first sentence from a block of text.
 */
function getFirstSentence(text) {
  let sentences = text.split(/(?<=[.?!])\s+/);
  return sentences.length > 0 ? sentences[0] : "";
}

/**
 * Append a loading message with an animated ellipsis (without extra text) to the chat history.
 */
function appendLoadingMessage() {
  const chatHistoryEl = document.getElementById("chatHistory");
  const loadingMessageEl = document.createElement("div");
  loadingMessageEl.classList.add("message", "bot-message", "loading");
  loadingMessageEl.innerHTML = `
    <div class="thinking-indicator">
      <div class="ellipsis">
        <span></span><span></span><span></span>
      </div>
    </div>`;
  chatHistoryEl.appendChild(loadingMessageEl);
  chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight;
  return loadingMessageEl;
}

/**
 * Remove the loading message.
 */
function removeLoadingMessage(loadingMessageEl) {
  if (loadingMessageEl && loadingMessageEl.parentNode) {
    loadingMessageEl.parentNode.removeChild(loadingMessageEl);
  }
}

/**
 * Call the generate_summary endpoint with the user's message.
 */
async function callGenerateSummary(userMessage) {
  if (!sessionId) { console.error("No sessionId available."); return; }
  const loadingMessageEl = appendLoadingMessage();
  try {
    const payload = {
      session_id: sessionId,
      message_history: [{ message: userMessage, role: "user" }]
    };
    const API_KEY = "full-stack-ai-lab";
    const response = await fetch("/generate_summary", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": API_KEY },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    console.log("Retrieved Contexts:", data.retrieved_contexts);
    let cleanedSummary = data.summary.replace(/\\n/g, "\n");
    if (cleanedSummary.startsWith('"') && cleanedSummary.endsWith('"')) {
      cleanedSummary = cleanedSummary.slice(1, -1);
    }
    const formattedSummary = markdownToHtml(cleanedSummary);
    let summaryHTML = `<div class="bot-response">
        <img src="/static/images/favicon.ico" class="bot-icon" alt="Bot Icon">
        <div class="bot-text">${formattedSummary}</div>
      </div>`;
    if (data.retrieved_contexts && data.retrieved_contexts.length > 0) {
      summaryHTML += `<div class="bot-references"><hr/><strong>References:</strong><ol>`;
      data.retrieved_contexts.forEach((ref) => {
        let source = "";
        if (ref.metadata && ref.metadata.source) { source = ref.metadata.source; }
        else if (ref.source) { source = ref.source; }
        let snippet = "";
        if (ref.page_content) { snippet = getFirstSentence(ref.page_content); }
        if (source) {
          summaryHTML += `<li>`;
          if (source.startsWith("http://") || source.startsWith("https://")) {
            summaryHTML += `<a href="${source}" target="_blank">${source}</a>`;
          } else {
            summaryHTML += source;
          }
          if (snippet) {
            summaryHTML += `<div class="source-snippet">${snippet}</div>`;
          }
          summaryHTML += `</li>`;
        }
      });
      summaryHTML += `</ol></div>`;
    }
    removeLoadingMessage(loadingMessageEl);
    appendMessage(summaryHTML, "bot");
  } catch (error) {
    console.error("Error generating summary:", error);
    removeLoadingMessage(loadingMessageEl);
    appendMessage("Error: Unable to get response from bot.", "bot");
  }
}

/**
 * Append a message to the chat history.
 */
function appendMessage(message, role) {
  const chatHistoryEl = document.getElementById("chatHistory");
  const messageEl = document.createElement("div");
  messageEl.classList.add("message");
  if (role === "bot") {
    messageEl.classList.add("bot-message");
    messageEl.innerHTML = message;
  } else {
    messageEl.classList.add("user-message");
    messageEl.innerText = message;
  }
  chatHistoryEl.appendChild(messageEl);
  chatHistoryEl.scrollTop = chatHistoryEl.scrollHeight;
}

/**
 * Toggle dark/light mode.
 */
function toggleMode() {
  document.body.classList.toggle("dark-mode");
  document.getElementById("chatContainer").classList.toggle("dark-mode");
  updateModeIcon();
}

/**
 * Update the mode toggle icon.
 */
function updateModeIcon() {
  const modeIcon = document.getElementById("modeIcon");
  modeIcon.src = document.body.classList.contains("dark-mode")
    ? "/static/images/sun.svg"
    : "/static/images/moon.svg";
}

/**
 * Set up event listeners.
 */
document.addEventListener("DOMContentLoaded", () => {
  getSessionId();
  updateModeIcon();
  const messageInput = document.getElementById("messageInput");
  const sendButton = document.getElementById("sendButton");
  const modeToggle = document.getElementById("modeToggle");
  modeToggle.addEventListener("click", toggleMode);
  sendButton.addEventListener("click", async () => {
    const userMessage = messageInput.value.trim();
    if (userMessage) {
      appendMessage(userMessage, "user");
      messageInput.value = "";
      await callGenerateSummary(userMessage);
    }
  });
  messageInput.addEventListener("keyup", (event) => {
    if (event.key === "Enter") {
      sendButton.click();
    }
  });
});
