/**
 * ==========================================================
 *  ระบบสต๊อควัตถุดิบโรงงาน (Factory Raw Material Stock System)
 *  Main entry point
 * ==========================================================
 */

var SHEET_ITEMS = 'Items';
var SHEET_STOCK_IN = 'StockIn';
var SHEET_STOCK_OUT = 'StockOut';
var SHEET_ADJUST = 'Adjustments';
var SHEET_LEDGER = 'Ledger';
var SHEET_USERS = 'Users';
var SHEET_CATEGORIES = 'Categories';
var SHEET_SETTINGS = 'Settings';

function ss_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function sheet_(name) {
  var sh = ss_().getSheetByName(name);
  if (!sh) throw new Error('ไม่พบชีต: ' + name + ' — กรุณารันฟังก์ชัน initializeSpreadsheet() ก่อน');
  return sh;
}

/**
 * Web app entry point. Serves the SPA shell.
 */
function doGet(e) {
  var template = HtmlService.createTemplateFromFile('Index');
  return template.evaluate()
    .setTitle('Stock Pro - ระบบสต๊อควัตถุดิบโรงงาน')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * Utility used by HTML templates to include partials
 * e.g. <?!= include('CSS'); ?>
 */
function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/**
 * Generic helper: convert a sheet's data into an array of objects
 * using the first row as keys.
 */
function sheetToObjects_(sheetName) {
  var sh = sheet_(sheetName);
  var values = sh.getDataRange().getValues();
  if (values.length < 2) return [];
  var headers = values[0];
  var out = [];
  for (var i = 1; i < values.length; i++) {
    var row = values[i];
    if (row.join('') === '') continue; // skip fully empty rows
    var obj = {};
    for (var c = 0; c < headers.length; c++) {
      obj[headers[c]] = row[c];
    }
    obj._row = i + 1; // 1-based sheet row number, useful for updates
    out.push(obj);
  }
  return out;
}

function nextId_(sheetName) {
  var props = PropertiesService.getScriptProperties();
  var key = 'seq_' + sheetName;
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var current = Number(props.getProperty(key) || 0);
    current += 1;
    props.setProperty(key, String(current));
    return current;
  } finally {
    lock.releaseLock();
  }
}

function nowStr_() {
  return Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
}

function todayStr_() {
  return Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd');
}
