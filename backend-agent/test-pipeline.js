/**
 * test-pipeline.js — Local Integration Test for Context Guardian Bot
 *
 * Prerequisites:
 *   1. Update backend-agent/.env with real GEMINI_API_KEY and MONGO_URI values.
 *   2. From the backend-agent/ directory, start the server:
 *        node dist/server.js
 *   3. In a separate terminal, run this test:
 *        node test-pipeline.js
 *
 * Expected behavior:
 *   - Sends a mock comment payload to http://localhost:3000/api/analyze-comment
 *   - Prints the JSON response from Gemini + MongoDB-backed pipeline
 */

const MOCK_PAYLOAD = {
  commentId: "t1_test123",
  author: "bad_user",
  body: "This is a toxic text payload that should be flagged by Gemini as violating content policy rules.",
};

const ENDPOINT = "http://localhost:3000/api/analyze-comment";

async function runTest() {
  console.log("=== Context Guardian Bot — Integration Test ===\n");
  console.log("Sending payload:", JSON.stringify(MOCK_PAYLOAD, null, 2));
  console.log("Target:", ENDPOINT);
  console.log("---");

  let response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(MOCK_PAYLOAD),
    });
  } catch (err) {
    console.error("❌ Integration test FAILED — network or server unreachable.");
    console.error("   Make sure the server is running:");
    console.error("     cd backend-agent && node dist/server.js");
    console.error(`   Original error: ${err.message}`);
    process.exit(1);
  }

  const status = response.status;
  let body;

  try {
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      body = await response.json();
    } else {
      const text = await response.text();
      console.error("❌ Server returned non-JSON response:");
      console.error(`   HTTP Status: ${status}`);
      console.error(`   Raw body: ${text}`);
      process.exit(1);
    }
  } catch (err) {
    console.error("❌ Failed to parse server response:");
    console.error(`   HTTP Status: ${status}`);
    console.error(`   Parse error: ${err.message}`);
    process.exit(1);
  }

  console.log(`HTTP Status: ${status}`);
  console.log("Response body:", JSON.stringify(body, null, 2));
  console.log("---");

  if (status === 200) {
    console.log("✅ Integration test PASSED — pipeline responded successfully.");
    console.log(`   violatesRules: ${body.violatesRules}`);
    console.log(`   reason:        ${body.reason}`);
    console.log("");
    console.log("=== VERIFICATION: MongoDB Atlas ===");
    console.log("1. Go to MongoDB Atlas → Browse Collections → context_guardian_db → moderation_logs");
    console.log("2. Refresh the collection and look for a document with");
    console.log(`   commentId: "${MOCK_PAYLOAD.commentId}"`);
    console.log("3. The fields `violatesRules` and `reason` must match the values above.");
    console.log("4. The `evaluatedAt` field should be a recent ISO timestamp.");
    console.log("5. Example successful Gemini JSON response (stored in `reason`):");
    console.log('   { "violatesRules": true, "reason": "Contains incitement to violence" }');
  } else if (status === 400) {
    console.error("❌ Integration test FAILED — bad request (missing fields).");
    console.error("   Ensure the server receives a body with: commentId, author, body");
    process.exit(1);
  } else if (status === 500) {
    console.error("❌ Integration test FAILED — internal server error.");
    console.error("   Check server terminal logs for Gemini / MongoDB errors.");
    console.error("   Verify GEMINI_API_KEY and MONGO_URI are set in backend-agent/.env");
    process.exit(1);
  } else {
    console.error(`❌ Integration test FAILED — unexpected HTTP status ${status}.`);
    process.exit(1);
  }
}

runTest();