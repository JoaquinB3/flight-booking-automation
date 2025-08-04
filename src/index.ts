import { chromium as playwright } from "playwright-core";
import chromium from "@sparticuz/chromium";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { promises as fs } from "fs";
import {
  APIGatewayProxyEvent,
  APIGatewayProxyResult,
  Context,
} from "aws-lambda";
import { ensureDirectoriesExist } from "./utils";
import {
  BROWSER_ARGS,
  VIEWPORT,
  USER_AGENT,
  TIMEOUT_NAVIGATION,
  TIMEOUT_SELECTOR,
  PARAMETERS,
} from "./utils/constants";
import { expect } from "playwright/test";
import { runStep, stepResults } from "./utils/runStep";
import { takeScreenshot } from "./utils/takeScreenshot";

/**
 * AWS Lambda handler function for automated web screenshot capture and S3 storage.
 *
 * This function automates the process of taking screenshots of specific web elements
 * using Playwright in a serverless AWS Lambda environment. It navigates to the Aegean Air
 * flights booking page, captures a screenshot of the flight booking component, and uploads
 * it to an S3 bucket for storage and retrieval.
 *
 * @description
 * The handler performs the following operations:
 * 1. Initializes a headless Chromium browser instance optimized for Lambda
 * 2. Navigates to the target URL (Aegean Air flights page)
 * 3. Waits for the specific flight booking component to load
 * 4. Captures a screenshot of the target element
 * 5. Uploads the screenshot to AWS S3 with a timestamped filename
 * 6. Returns the S3 URL and operation status
 *
 * @param {APIGatewayProxyEvent} event - The API Gateway event object containing:
 *   - httpMethod: The HTTP method used for the request
 *   - headers: Request headers including authorization and content-type
 *   - queryStringParameters: URL query parameters (optional)
 *   - body: Request body content (optional)
 *   - pathParameters: Path parameters from the URL (optional)
 *   - requestContext: Additional request context from API Gateway
 *
 * @param {Context} [context] - Optional AWS Lambda context object containing:
 *   - functionName: Name of the Lambda function
 *   - functionVersion: Version of the Lambda function
 *   - invokedFunctionArn: ARN of the invoked function
 *   - memoryLimitInMB: Memory limit configured for the function
 *   - remainingTimeInMillis: Remaining execution time
 *   - logGroupName: CloudWatch log group name
 *   - logStreamName: CloudWatch log stream name
 *   - awsRequestId: Unique request identifier
 *
 * @returns {Promise<APIGatewayProxyResult>} A promise that resolves to an API Gateway response object containing:
 *   - statusCode: HTTP status code (200 for success, 500 for errors)
 *   - headers: Response headers including Content-Type
 *   - body: JSON stringified response body with:
 *     - message: Success or error message
 *     - timestamp: ISO timestamp of the operation
 *     - screenshotUrl: S3 URL of the captured screenshot (on success)
 *     - event: Original event object for debugging
 *
 * @throws {Error} Throws various errors that are caught and returned as 500 responses:
 *   - Browser launch failures due to Lambda environment constraints
 *   - Navigation timeouts when the target page fails to load
 *   - Element not found errors when the flight booking component is missing
 *   - File system errors during screenshot saving
 *   - S3 upload failures due to permissions or network issues
 *
 * @example
 * // Example successful response
 * {
 *   statusCode: 200,
 *   headers: { "Content-Type": "application/json" },
 *   body: JSON.stringify({
 *     message: "Success",
 *     timestamp: "2024-01-15T10:30:45.123Z",
 *     screenshotUrl: "https://technical-playwright-result.s3.amazonaws.com/screenshots/aegean-flight-booking-2024-01-15T10-30-45-123Z.png",
 *     event: { ... }
 *   })
 * }
 *
 * @example
 * // Example error response
 * {
 *   statusCode: 500,
 *   headers: { "Content-Type": "application/json" },
 *   body: JSON.stringify({
 *     message: "Error: Flight booking component not found",
 *     timestamp: "2024-01-15T10:30:45.123Z",
 *     screenshotUrl: null,
 *     event: { ... }
 *   })
 * }
 *
 * @requires playwright-core - For browser automation
 * @requires @sparticuz/chromium - Chromium binary optimized for Lambda
 * @requires @aws-sdk/client-s3 - AWS S3 client for file uploads
 *
 * @environment
 * Required environment variables:
 * - AWS_REGION: AWS region for S3 operations (defaults to 'us-east-2')
 * - AWS_S3_BUCKET: S3 bucket name for screenshot storage (defaults to 'technical-playwright-result')
 *
 * @performance
 * - Average execution time: 15-30 seconds (depending on page load time)
 * - Memory usage: ~512MB recommended minimum
 * - Timeout: Configure Lambda timeout to at least 60 seconds
 *
 * @security
 * - Requires appropriate IAM permissions for S3 PutObject operations
 * - Screenshots are stored with public read access via S3 URLs
 * - No sensitive data should be captured in screenshots
 *
 * @version 1.0.0
 * @since 2025-07-24
 * @author a11ySolutions Development Team
 */
export const handler = async (
  event: APIGatewayProxyEvent,
  context?: Context
): Promise<APIGatewayProxyResult> => {
  let browser: any = null;
  let screenshotUrl: string | null = null;
  let statusCode = 200;
  let message = "Success";
  stepResults.length = 0;

  try {
    // Ensure necessary directories exist
    await ensureDirectoriesExist();

    // Launch browser with configuration suitable for Lambda
    browser = await playwright.launch({
      args: BROWSER_ARGS,
      executablePath: await chromium.executablePath(),
    });

    const context = await browser.newContext({
      viewport: VIEWPORT,
      userAgent: USER_AGENT,
    });

    const page = await context.newPage();

    // Configure timeouts longer for Lambda environment
    page.setDefaultNavigationTimeout(TIMEOUT_NAVIGATION);

    // Navigate to Aegean Air page
    await runStep(
      "Navigate to Aegean",
      async () => {
        await page.goto(PARAMETERS.url, {
          waitUntil: "domcontentloaded",
          timeout: TIMEOUT_NAVIGATION,
        });
      },
      page
    );

    // Wait for the specific selector to be visible
    await runStep(
      "Wait for booking component",
      async () => {
        await page.waitForSelector(PARAMETERS.selector, {
          state: "visible",
          timeout: TIMEOUT_SELECTOR,
        });
      },
      page
    );

    // Validate the presence of the trip type selector (Round-trip/One-way/multicity)
    // await runStep(
    //     "Validate trip type selectors (Round-trip, One-way, Multi-City)",
    //     async () => {
    //         const toggleTripTypeButton = page.getByRole("button", { name: /Round-trip/i });
    //         await expect(toggleTripTypeButton).toBeVisible({ timeout: TIMEOUT_SELECTOR });
    //         await toggleTripTypeButton.click();

    //         // Aseguramos que aparezca el radiogroup
    //         const radioGroup = page.locator('div[role="radiogroup"]');
    //         await expect(radioGroup).toBeVisible({ timeout: TIMEOUT_SELECTOR });

    //         // Localizamos los radios y los filtramos por texto visible dentro del span
    //         const roundTripOption = radioGroup.locator('div[role="radio"]').filter({ hasText: "Round-trip" });
    //         const oneWayOption = radioGroup.locator('div[role="radio"]').filter({ hasText: "One-way" });
    //         const multiCityOption = radioGroup.locator('div[role="radio"]').filter({ hasText: /Multi[- ]?City/i });

    //         await expect(roundTripOption).toBeVisible();
    //         await expect(oneWayOption).toBeVisible();
    //         await expect(multiCityOption).toBeVisible();

    //         // One-way
    //         await oneWayOption.click();
    //         await expect(oneWayOption).toHaveAttribute("aria-checked", "true");

    //         // Round-trip
    //         await roundTripOption.click();
    //         await expect(roundTripOption).toHaveAttribute("aria-checked", "true");

    //         // Multi-City
    //         await multiCityOption.click();
    //         await expect(multiCityOption).toHaveAttribute("aria-checked", "true");

    //         const doneButton = page.locator('button[data-att="done"]');
    //         if (await doneButton.isVisible()) {
    //         await doneButton.click();
    //         }
    //     },
    //     page
    //  );

    // Validate that all passenger input fields (Adults, Children, Infants)
    await runStep(
      "Validate passengers and travel class selector",
      async () => {
        const buttons = page.getByRole("button", { name: /Economy/i });
        const passengerClassButton = await buttons
          .filter({
            hasText: /Passenger/i,
          })
          .first();
        await expect(passengerClassButton).toBeVisible({ timeout: 30000 });
        await passengerClassButton.click();

        const travelClassLabel = page.locator("label", {
          hasText: /^Travel class$/,
        });
        await expect(travelClassLabel).toBeVisible({ timeout: 30000 });
        await expect(passengerClassButton).toHaveText(/Economy/);

        const adultGroup = page.locator("div#age1");
        await expect(adultGroup).toBeVisible();
        await expect(page.locator("#age1-value")).toHaveText("1");
        await expect(page.locator("#age1-increase")).toBeEnabled();
        await expect(page.locator("#age1-decrease")).toHaveClass(
          /cursor-not-allowed/
        );

        await page.locator("#age1-increase").click();
        await expect(page.locator("#age1-value")).toHaveText("2");

        const childrenGroup = page.locator("div#age2");
        await expect(childrenGroup).toBeVisible();
        await expect(page.locator("#age2-value")).toHaveText("0");
        await expect(page.locator("#age2-increase")).toBeEnabled();

        await page.locator("#age2-increase").click();
        await expect(page.locator("#age2-value")).toHaveText("1");

        const infantsGroup = page.locator("div#age4");
        await expect(infantsGroup).toBeVisible();
        await expect(page.locator("#age4-value")).toHaveText("0");
        await expect(page.locator("#age4-increase")).toBeEnabled();

        await page.locator("#age4-increase").click();
        await expect(page.locator("#age4-value")).toHaveText("1");

        await passengerClassButton.click();
      },
      page
    );

    // Validate operability of origin and destination input fields:
    await runStep(
      "Select origin and destination airports",
      async () => {
        // ORIGIN
        const originContainer = page.locator('[data-att="f1_origin"]');
        const originButton = originContainer.locator("button:visible").first();

        await expect(originButton).toBeVisible();
        await originButton.click();

        const originInput = page.locator(
          'input[aria-label="fc-booking-origin-aria-label"]'
        );
        await originInput.click();
        await originInput.fill("ISTANBUL (IST)");

        // DESTINATION
        const destinationContainer = page.locator(
          '[data-att="f1_destination"]'
        );
        const destinationButton = destinationContainer
          .locator("button:visible")
          .first();

        await expect(destinationButton).toBeVisible();
        await destinationButton.click();

        const destinationInput = page.locator(
          'input[aria-label="fc-booking-destination-aria-label"]'
        );
        await destinationInput.click();
        await destinationInput.fill("ATHENS (ATH)");
      },
      page
    );

    // Validate departure and return date input fields operability
    await runStep(
      "Validate departure and return date selectors (select tomorrow and day after tomorrow)",
      async () => {
        // DEPARTURE
        const departureButton = page.locator(
          '[data-att="start-date-toggler"] button[aria-haspopup="dialog"]'
        );
        await expect(departureButton).toBeVisible();
        await departureButton.click();

        await page
          .locator('[role="dialog"]')
          .waitFor({ state: "visible", timeout: 5000 });

        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);

        const yyyyOut = tomorrow.getFullYear();
        const mmOut = String(tomorrow.getMonth() + 1).padStart(2, "0");
        const ddOut = String(tomorrow.getDate()).padStart(2, "0");

        const departureSelector = `button[data-att="day-${yyyyOut}-${mmOut}-${ddOut}"]`;
        const departureDayButton = page.locator(departureSelector);
        await departureDayButton.click();

        // RETURN
        const returnButton = page.locator(
          '[data-att="end-date-toggler"] button[aria-haspopup="dialog"]'
        );
        await expect(returnButton).toBeVisible();
        await returnButton.click();

        await page
          .locator('[role="dialog"]')
          .waitFor({ state: "visible", timeout: 5000 });

        const dayAfterTomorrow = new Date();
        dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);

        const yyyyRet = dayAfterTomorrow.getFullYear();
        const mmRet = String(dayAfterTomorrow.getMonth() + 1).padStart(2, "0");
        const ddRet = String(dayAfterTomorrow.getDate()).padStart(2, "0");

        const returnSelector = `button[data-att="day-${yyyyRet}-${mmRet}-${ddRet}"]`;
        const returnDayButton = page.locator(returnSelector);
        await returnDayButton.click();
      },
      page
    );

    // Validate search button visibility and operability
    await runStep(
      "Validate search button is enabled and contains 'search'",
      async () => {
        const SEARCH_BUTTON_SELECTOR = '[data-att="search"]';

        // Esperar a que el botón sea visible
        await page.waitForSelector(SEARCH_BUTTON_SELECTOR, {
          state: "visible",
          timeout: TIMEOUT_SELECTOR,
        });

        // Validar que no esté deshabilitado (usamos getAttribute sobre 'aria-disabled')
        const isAriaDisabled = await page.getAttribute(
          SEARCH_BUTTON_SELECTOR,
          "aria-disabled"
        );
        expect(isAriaDisabled).toBe("false");

        // Validar que contenga el texto 'search'
        const buttonText = await page.textContent(SEARCH_BUTTON_SELECTOR);
        expect(buttonText?.toLowerCase()).toContain("search");
      },
      page
    );

    // Takes a screenshot of the current page state, uploads it to S3, and returns the public URL
    screenshotUrl = await takeScreenshot(page, "aegean-flight-booking");
  } catch (error: any) {
    console.error("Error:", error);
    console.error("Stack trace:", error.stack);
    statusCode = 500;
    message = `Error: ${error.message}`;
  } finally {
    // Close browser if it was opened
    if (browser) {
      try {
        await browser.close();
      } catch (closeError: any) {
        console.error("Error closing browser:", closeError);
      }
    }
  }

  // Create response with URL of the screenshot if it was successful
  const response: APIGatewayProxyResult = {
    statusCode,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message,
      timestamp: new Date().toISOString(),
      screenshotUrl,
      event,
      steps: stepResults,
    }),
  };
  return response;
};
