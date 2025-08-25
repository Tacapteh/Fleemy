#!/usr/bin/env node

// Simple test to check if the new components can be imported
const fs = require('fs');
const path = require('path');

console.log('🔍 Testing Component Structure...');

// Check if key files exist
const filesToCheck = [
  '/app/frontend/src/firebase.js',
  '/app/frontend/src/components/WeeklyGrid.jsx',
  '/app/frontend/src/components/MonthGrid.jsx',
  '/app/frontend/src/components/TaskForm.jsx',
  '/app/frontend/src/styles/WeeklyGrid.css',
  '/app/frontend/src/styles/MonthCalendar.css'
];

let allFilesExist = true;

filesToCheck.forEach(file => {
  if (fs.existsSync(file)) {
    console.log(`✅ ${file} exists`);
  } else {
    console.log(`❌ ${file} missing`);
    allFilesExist = false;
  }
});

// Check for syntax errors in key files
const jsFiles = [
  '/app/frontend/src/firebase.js',
  '/app/frontend/src/components/WeeklyGrid.jsx',
  '/app/frontend/src/components/MonthGrid.jsx',
  '/app/frontend/src/components/TaskForm.jsx'
];

console.log('\n🔍 Checking for basic syntax issues...');

jsFiles.forEach(file => {
  if (fs.existsSync(file)) {
    const content = fs.readFileSync(file, 'utf8');
    
    // Basic syntax checks
    const issues = [];
    
    // Check for unmatched brackets
    const openBrackets = (content.match(/\{/g) || []).length;
    const closeBrackets = (content.match(/\}/g) || []).length;
    if (openBrackets !== closeBrackets) {
      issues.push(`Unmatched brackets: ${openBrackets} open, ${closeBrackets} close`);
    }
    
    // Check for unmatched parentheses
    const openParens = (content.match(/\(/g) || []).length;
    const closeParens = (content.match(/\)/g) || []).length;
    if (openParens !== closeParens) {
      issues.push(`Unmatched parentheses: ${openParens} open, ${closeParens} close`);
    }
    
    // Check for missing imports
    if (content.includes('React') && !content.includes('import React')) {
      issues.push('Uses React but missing import');
    }
    
    if (issues.length > 0) {
      console.log(`⚠️  ${file}: ${issues.join(', ')}`);
    } else {
      console.log(`✅ ${file} looks good`);
    }
  }
});

console.log('\n📊 Component Structure Test Complete');
console.log(`Files checked: ${filesToCheck.length}`);
console.log(`All files exist: ${allFilesExist ? 'Yes' : 'No'}`);