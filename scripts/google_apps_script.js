/**
 * ==============================================================================
 * KOTHAY BOSHBO — GOOGLE APPS SCRIPT WEB APP (LIVE CMS ENDPOINT)
 * ==============================================================================
 * This script transforms your Google Sheet into a real-time, CORS-enabled
 * JSON REST API for the "Kothay Boshbo" website.
 *
 * HOW TO DEPLOY:
 * 1. Open your Google Sheet (with tabs: "Restaurants" and "Cafes").
 * 2. Click "Extensions" > "Apps Script".
 * 3. Delete any code in the editor, and paste this ENTIRE file.
 * 4. Click "Deploy" > "New deployment".
 * 5. Select type: "Web app".
 * 6. Configuration:
 *    - Description: "Kothay Boshbo API"
 *    - Execute as: "Me"
 *    - Who has access: "Anyone"  <-- CRITICAL for public website access
 * 7. Click "Deploy", authorize permissions, and COPY the Web app URL.
 * 8. Paste that URL into `js/config.js` as `SHEET_ENDPOINT`:
 *    const SHEET_ENDPOINT = "https://script.google.com/macros/s/.../exec";
 *
 * HOW IT WORKS:
 * - When you add, modify, or set `active = FALSE` on any row in the Sheet,
 *   the website will reflect the change immediately when refreshed!
 * ==============================================================================
 */

function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var paramType = (e && e.parameter && e.parameter.type) ? e.parameter.type.toLowerCase() : null;
    var allData = [];

    // Read Restaurants tab
    var restSheet = ss.getSheetByName("Restaurants");
    if (restSheet) {
      allData = allData.concat(getSheetObjects(restSheet, "restaurant"));
    }

    // Read Cafes tab
    var cafeSheet = ss.getSheetByName("Cafes");
    if (cafeSheet) {
      allData = allData.concat(getSheetObjects(cafeSheet, "cafe"));
    }

    // Filter by type if requested (?type=restaurant or ?type=cafe)
    if (paramType) {
      allData = allData.filter(function(item) {
        return item.type === paramType;
      });
    }

    // Return as CORS-enabled JSON
    return ContentService.createTextOutput(JSON.stringify(allData))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      status: "error",
      message: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Converts a worksheet's rows into an array of JavaScript objects.
 * Row 1 is assumed to be the header row.
 */
function getSheetObjects(sheet, fallbackType) {
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  var rawHeaders = data[0];
  var headers = rawHeaders.map(function(h) {
    return h.toString().trim().toLowerCase().replace(/\s+/g, "_");
  });

  var results = [];

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var obj = {};

    for (var col = 0; col < headers.length; col++) {
      var key = headers[col];
      obj[key] = row[col] !== undefined ? row[col] : "";
    }

    // If type wasn't explicitly specified, use the fallback
    if (!obj.type) {
      obj.type = fallbackType;
    }

    // Ensure rating is float
    obj.rating = parseFloat(obj.rating) || 4.0;

    // Ensure coordinates are float
    obj.lat = parseFloat(obj.lat) || 23.7461;
    obj.lng = parseFloat(obj.lng) || 90.3742;

    // Ignore inactive rows
    if (String(obj.active).toUpperCase() === "FALSE") {
      continue;
    }

    results.push(obj);
  }

  return results;
}
