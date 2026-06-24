function promisifyOfficeAsync(callOffice) {
  return new Promise((resolve, reject) => {
    callOffice((result) => {
      if (result.status === Office.AsyncResultStatus.Succeeded) {
        resolve(result.value);
      } else {
        reject(new Error(result.error?.message || "Office operation failed."));
      }
    });
  });
}

export const OFFICE_SELECTION_STATES = Object.freeze({
  READY: "ready",
  NO_SELECTION: "no-selection",
  UNSUPPORTED_SELECTION: "unsupported-selection",
  STALE_SELECTION: "stale-selection",
  APPLIED: "applied",
});

export async function getSelectedTextFromOffice(officeContext = Office.context) {
  return promisifyOfficeAsync((callback) => {
    officeContext.document.getSelectedDataAsync(
      Office.CoercionType.Text,
      callback,
    );
  });
}

export async function getCurrentOfficeSelection(officeContext = Office.context) {
  try {
    const text = await getSelectedTextFromOffice(officeContext);
    if (!text || !text.trim()) {
      return { state: OFFICE_SELECTION_STATES.NO_SELECTION, text: "" };
    }

    return { state: OFFICE_SELECTION_STATES.READY, text };
  } catch (error) {
    return {
      state: OFFICE_SELECTION_STATES.UNSUPPORTED_SELECTION,
      text: "",
      error: error instanceof Error ? error.message : "Unsupported Office selection.",
    };
  }
}

export async function setSelectedTextInOffice(text, officeContext = Office.context) {
  return promisifyOfficeAsync((callback) => {
    officeContext.document.setSelectedDataAsync(
      text,
      { coercionType: Office.CoercionType.Text },
      callback,
    );
  });
}

export async function replaceSelectedTextInOffice(
  { expectedText, replacementText },
  officeContext = Office.context,
) {
  const currentSelection = await getCurrentOfficeSelection(officeContext);
  if (currentSelection.state !== OFFICE_SELECTION_STATES.READY) {
    return currentSelection;
  }
  if (currentSelection.text !== expectedText) {
    return {
      state: OFFICE_SELECTION_STATES.STALE_SELECTION,
      text: currentSelection.text,
    };
  }

  await setSelectedTextInOffice(replacementText, officeContext);
  return {
    state: OFFICE_SELECTION_STATES.APPLIED,
    text: replacementText,
  };
}

export function getOfficeHostLabel(office = Office) {
  const host = office.context?.host;
  if (host === office.HostType.Word) {
    return "Word";
  }
  if (host === office.HostType.PowerPoint) {
    return "PowerPoint";
  }
  return "Office";
}
