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

export async function getSelectedTextFromOffice(officeContext = Office.context) {
  return promisifyOfficeAsync((callback) => {
    officeContext.document.getSelectedDataAsync(
      Office.CoercionType.Text,
      callback,
    );
  });
}

export async function replaceSelectedTextInOffice(
  text,
  officeContext = Office.context,
) {
  return promisifyOfficeAsync((callback) => {
    officeContext.document.setSelectedDataAsync(
      text,
      { coercionType: Office.CoercionType.Text },
      callback,
    );
  });
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
