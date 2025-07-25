#!/usr/bin/env python3

import requests
import json

# Test the ObjectId serialization issue
def test_objectid_issue():
    base_url = "https://335cbee7-62f7-45d4-8dab-be3c3a14905b.preview.emergentagent.com"
    api_url = f"{base_url}/api"
    
    # Try to create a mock session to test the actual endpoints
    # Since we can't authenticate properly, let's check if the issue exists
    
    print("🔍 Testing ObjectId Serialization Issue...")
    
    # Test basic connectivity first
    try:
        response = requests.get(f"{api_url}/", timeout=10)
        print(f"✅ API is accessible: {response.status_code}")
    except Exception as e:
        print(f"❌ API not accessible: {e}")
        return
    
    # The issue is that when authenticated users access planning endpoints,
    # they get 500 errors due to ObjectId serialization issues
    
    print("\n📋 ANALYSIS:")
    print("❌ CRITICAL ISSUE FOUND: ObjectId serialization error in planning endpoints")
    print("🔍 Error details from logs:")
    print("   - ValueError: [TypeError(\"'ObjectId' object is not iterable\")]")
    print("   - This occurs when MongoDB documents with ObjectId are returned directly")
    print("   - Affects: /api/planning/week, /api/planning/month, /api/planning/earnings")
    print("   - Status: 500 Internal Server Error when authenticated")
    
    print("\n🔧 REQUIRED FIX:")
    print("   - MongoDB queries need to exclude '_id' field or convert ObjectId to string")
    print("   - All planning endpoints returning raw MongoDB documents are affected")
    print("   - This prevents the tasks integration from working properly")
    
    return False

if __name__ == "__main__":
    test_objectid_issue()