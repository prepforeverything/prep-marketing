export function createObservers(page, capture) {
  const consoleMessages = [];
  const pageErrors = [];
  const requestFailures = [];
  const responseFailures = [];

  if (capture.console) {
    page.on("console", (message) => {
      consoleMessages.push({
        type: message.type(),
        text: message.text(),
        location: message.location()
      });
    });
  }

  if (capture.pageErrors) {
    page.on("pageerror", (error) => {
      pageErrors.push({
        message: error.message,
        stack: error.stack || null
      });
    });
  }

  if (capture.network) {
    page.on("requestfailed", (request) => {
      requestFailures.push({
        method: request.method(),
        url: request.url(),
        failure: request.failure()?.errorText || "unknown"
      });
    });

    page.on("response", (response) => {
      if (response.status() >= 400) {
        responseFailures.push({
          method: response.request().method(),
          status: response.status(),
          statusText: response.statusText(),
          url: response.url()
        });
      }
    });
  }

  return {
    consoleMessages,
    pageErrors,
    requestFailures,
    responseFailures
  };
}
