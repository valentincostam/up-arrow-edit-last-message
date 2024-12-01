/**
 * Returns a promise that resolves with the element matching the given selector
 * when it becomes available in the DOM.
 *
 * @param {string} selector - The CSS selector to match the desired element.
 * @param {HTMLElement} parentElement - The parent element to search within.
 * @returns {Promise<Element>} A promise that resolves with the element when it exists in the DOM.
 */
function getElementWhenExists(selector, parentElement = document) {
  return new Promise((resolve) => {
    if (parentElement.querySelector(selector)) {
      return resolve(parentElement.querySelector(selector));
    }

    const observer = new MutationObserver(() => {
      if (parentElement.querySelector(selector)) {
        resolve(parentElement.querySelector(selector));
        observer.disconnect();
      }
    });

    observer.observe(
      parentElement === document ? document.body : parentElement,
      {
        subtree: true,
        childList: true,
      }
    );
  });
}

/**
 * Waits for an element to disappear from the DOM.
 *
 * @param {string} selector - The CSS selector of the element to wait for.
 * @returns {Promise<void>} A promise that resolves when the element has disappeared.
 */
function waitForElementToDisappear(selector) {
  return new Promise((resolve) => {
    if (!document.querySelector(selector)) {
      return resolve();
    }

    const observer = new MutationObserver(() => {
      if (!document.querySelector(selector)) {
        resolve();
        observer.disconnect();
      }
    });

    observer.observe(document.body, {
      subtree: true,
      childList: true,
    });
  });
}

/**
 * Parses a string and returns a Date object representing the date and time.
 *
 * @param {string} string - The string to parse.
 * @returns {Date|undefined} - The parsed Date object, or undefined if the string does not match the expected format.
 */
function getDateFromString(string) {
  // This regex matches date-time strings in the following formats:
  // [10:30 AM, 4/15/2023]
  // [2:45 p.m., 12/31/2022]
  // [14:00, 1/1/2024]
  const dateTimeRegex =
    /\[(\d{1,2}:\d{2})(?:\s*(a\.?\s*m\.?|p\.?\s*m\.?))?, (\d{1,2}\/\d{1,2}\/\d{4})\]/i;

  const matches = dateTimeRegex.exec(string.replace(/&nbsp;/g, " "));

  if (!matches || matches.length < 3) return;

  const timePart = matches[1].trim();

  const ampm = matches[2]
    ? matches[2].replace(/\.\s?/g, "").toLowerCase()
    : null;

  const userLanguage = chrome.i18n.getUILanguage();

  const dateParts = new Intl.DateTimeFormat(userLanguage).formatToParts();
  const day = dateParts.find(part => part.type === 'day').value;
  const month = dateParts.find(part => part.type === 'month').value;
  const year = dateParts.find(part => part.type === 'year').value;

  let [hours, minutes] = timePart.split(":").map(Number);

  if (ampm === "pm" && hours < 12) {
    hours += 12;
  } else if (ampm === "am" && hours === 12) {
    hours = 0;
  }

  return new Date(year, month - 1, day, hours, minutes);
}

/**
 * Checks if a message bubble is editable based on certain conditions.
 *
 * @param {HTMLElement} messageBubble - The message bubble element to check.
 * @returns {boolean} - Returns true if the message bubble is editable, false otherwise.
 */
const isMessageEditable = (messageBubble) => {
  const messageContainer = messageBubble.querySelector(
    ".copyable-text[data-pre-plain-text]"
  );

  if (!messageContainer) return false;

  const isPoll = Boolean(
    messageBubble.querySelector(
      `[aria-label*='${chrome.i18n.getMessage("poll")}' i]`
    )
  );
  const wasSent = Boolean(
    messageBubble.querySelector("[data-icon='msg-check']")
  );
  const wasForwarded = Boolean(
    messageBubble.querySelector("[data-icon='forwarded']")
  );
  const wasDelivered = Boolean(
    messageBubble.querySelector("[data-icon='msg-dblcheck']")
  );

  if ((!wasSent && !wasDelivered) || wasForwarded || isPoll) return false;

  const messagePrePlainText = messageContainer.dataset.prePlainText;
  const messageDateTime = getDateFromString(messagePrePlainText);
  const currentDateTime = new Date();
  const elapsedTime = currentDateTime - messageDateTime;
  const isRecent = elapsedTime <= 15 * 60 * 1000; // Fifteen minutes in milliseconds.

  if (!isRecent) {
    alert(chrome.i18n.getMessage("editTimeLimitErrorMessage"));
    return false;
  }

  return true;
};

/**
 * Handles the key up event. If the ArrowUp key is pressed, the popup to edit last sent message is shown.
 * If the last sent message is not editable, an alert is shown.
 *
 * @param {Event} event - The key up event object.
 * @returns {Promise<void>} - A promise that resolves when the function completes.
 */
const handleKeyUp = async (event) => {
  if (event.key !== "ArrowUp") return false;

  const messageInputField = document.querySelector("#main [role='textbox']");

  const isMessageInputFieldEventTarget = messageInputField === event.target;
  const isMessageInputFieldFocused =
    messageInputField === document.activeElement;
  const isMessageInputFieldEmpty = messageInputField.innerText.trim() === "";

  if (
    !isMessageInputFieldEventTarget ||
    !isMessageInputFieldFocused ||
    !isMessageInputFieldEmpty
  )
    return;

  const lastSentMessage = [...document.querySelectorAll(".message-out")].at(-1);

  const messageBubble = lastSentMessage.querySelector(
    `[aria-label='${chrome.i18n.getMessage("you")}:' i]`
  )?.parentElement;

  if (!isMessageEditable(messageBubble)) return;

  messageBubble.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));

  const contextMenuButton = await getElementWhenExists(
    `[aria-label='${chrome.i18n.getMessage("contextMenu")}' i]`,
    messageBubble
  );

  contextMenuButton.click();

  const editButton = await getElementWhenExists(
    `[aria-label='${chrome.i18n.getMessage("edit")}' i]`
  );

  editButton.click();

  const editTextField = await getElementWhenExists("[role='textbox']");

  editTextField.focus();

  await waitForElementToDisappear("[data-animate-modal-popup='true']");

  lastSentMessage.dispatchEvent(new MouseEvent("mouseout", { bubbles: true }));

  messageInputField.focus();
};

document.addEventListener("keyup", handleKeyUp);
