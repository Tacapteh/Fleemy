#!/usr/bin/env python3

import requests
import sys
import json
from datetime import datetime

class FleemyAPITester:
    def __init__(self, base_url="https://be3367aa-ed75-4a84-b8d2-ad1b0e2aa3df.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.session_token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.user_data = None

    def log_test(self, name, success, details=""):
        """Log test results"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name} - PASSED {details}")
        else:
            print(f"❌ {name} - FAILED {details}")
        return success

    def run_api_test(self, name, method, endpoint, expected_status, data=None, headers=None):
        """Run a single API test"""
        url = f"{self.api_url}{endpoint}"
        test_headers = {'Content-Type': 'application/json'}
        
        if self.session_token:
            test_headers['Authorization'] = f'Bearer {self.session_token}'
        
        if headers:
            test_headers.update(headers)

        try:
            if method == 'GET':
                response = requests.get(url, headers=test_headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=test_headers, timeout=10)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=test_headers, timeout=10)
            elif method == 'DELETE':
                response = requests.delete(url, headers=test_headers, timeout=10)

            success = response.status_code == expected_status
            details = f"Status: {response.status_code}"
            
            if success:
                try:
                    response_data = response.json()
                    details += f", Response: {json.dumps(response_data, indent=2)[:200]}..."
                    return self.log_test(name, True, details), response_data
                except:
                    return self.log_test(name, True, details), {}
            else:
                try:
                    error_data = response.json()
                    details += f", Error: {error_data}"
                except:
                    details += f", Error: {response.text[:200]}"
                return self.log_test(name, False, details), {}

        except Exception as e:
            return self.log_test(name, False, f"Exception: {str(e)}"), {}

    def test_basic_connectivity(self):
        """Test basic API connectivity"""
        print("\n🔍 Testing Basic Connectivity...")
        success, data = self.run_api_test("API Root Endpoint", "GET", "/", 200)
        return success

    def test_auth_endpoints(self):
        """Test authentication endpoints"""
        print("\n🔍 Testing Authentication Endpoints...")
        
        # Test login without session_id (should fail)
        success, data = self.run_api_test(
            "Login without session_id", 
            "POST", 
            "/auth/login", 
            422,  # Validation error expected
            {}
        )
        
        # Test login with invalid session_id (should fail)
        success, data = self.run_api_test(
            "Login with invalid session_id", 
            "POST", 
            "/auth/login", 
            401,  # Unauthorized expected
            {"session_id": "invalid_session_123"}
        )
        
        # Test /auth/me without token (should fail)
        success, data = self.run_api_test(
            "Get user info without token", 
            "GET", 
            "/auth/me", 
            401
        )
        
        return True

    def test_planning_endpoints_unauthorized(self):
        """Test planning endpoints without authentication"""
        print("\n🔍 Testing Planning Endpoints (Unauthorized)...")
        
        current_year = datetime.now().year
        current_week = datetime.now().isocalendar()[1]
        
        # All these should return 401 without authentication
        endpoints = [
            ("Get week planning", "GET", f"/planning/week/{current_year}/{current_week}"),
            ("Get earnings", "GET", f"/planning/earnings/{current_year}/{current_week}"),
            ("Create event", "POST", "/planning/events"),
            ("Create task", "POST", "/planning/tasks"),
        ]
        
        for name, method, endpoint in endpoints:
            self.run_api_test(name + " (unauthorized)", method, endpoint, 401)
        
        return True

    def test_invalid_endpoints(self):
        """Test invalid endpoints"""
        print("\n🔍 Testing Invalid Endpoints...")
        
        # Test non-existent endpoints
        invalid_endpoints = [
            ("Non-existent endpoint", "GET", "/nonexistent"),
            ("Invalid planning endpoint", "GET", "/planning/invalid"),
            ("Invalid auth endpoint", "POST", "/auth/invalid"),
        ]
        
        for name, method, endpoint in invalid_endpoints:
            self.run_api_test(name, method, endpoint, 404)
        
        return True

    def test_data_validation(self):
        """Test data validation on endpoints"""
        print("\n🔍 Testing Data Validation...")
        
        # Test event creation with invalid data (without auth, should get 401 first)
        self.run_api_test(
            "Create event with invalid data (no auth)", 
            "POST", 
            "/planning/events", 
            401,
            {"invalid": "data"}
        )
        
        # Test task creation with invalid data (without auth, should get 401 first)
        self.run_api_test(
            "Create task with invalid data (no auth)", 
            "POST", 
            "/planning/tasks", 
            401,
            {"invalid": "data"}
        )
        
        return True

    def test_planning_week_endpoint(self):
        """Test planning week endpoint structure"""
        print("\n🔍 Testing Planning Week Endpoint...")
        
        current_year = datetime.now().year
        current_week = datetime.now().isocalendar()[1]
        
        # Test without authentication (should fail)
        success, data = self.run_api_test(
            "Get week planning (no auth)", 
            "GET", 
            f"/planning/week/{current_year}/{current_week}", 
            401
        )
        
        # Test with invalid year/week
        success, data = self.run_api_test(
            "Get week planning (invalid year)", 
            "GET", 
            f"/planning/week/invalid/{current_week}", 
            422  # Validation error expected
        )
        
        return True

    def test_planning_month_endpoint(self):
        """Test planning month endpoint structure"""
        print("\n🔍 Testing Planning Month Endpoint...")
        
        current_year = datetime.now().year
        current_month = datetime.now().month
        
        # Test without authentication (should fail)
        success, data = self.run_api_test(
            "Get month planning (no auth)", 
            "GET", 
            f"/planning/month/{current_year}/{current_month}", 
            401
        )
        
        return True

    def test_planning_earnings_endpoint(self):
        """Test planning earnings endpoint and data structure compatibility"""
        print("\n🔍 Testing Planning Earnings Endpoint...")
        
        current_year = datetime.now().year
        current_week = datetime.now().isocalendar()[1]
        
        # Test without authentication (should fail)
        success, data = self.run_api_test(
            "Get earnings (no auth)", 
            "GET", 
            f"/planning/earnings/{current_year}/{current_week}", 
            401
        )
        
        return True

    def test_event_crud_endpoints(self):
        """Test event CRUD endpoints structure"""
        print("\n🔍 Testing Event CRUD Endpoints...")
        
        # Test event creation without auth
        event_data = {
            "description": "Réunion client important",
            "client_id": "client-123",
            "client_name": "Acme Corp",
            "day": "monday",
            "start_time": "09:00",
            "end_time": "17:00",
            "status": "pending",
            "hourly_rate": 75.0
        }
        
        success, data = self.run_api_test(
            "Create event (no auth)", 
            "POST", 
            "/planning/events", 
            401,
            event_data
        )
        
        # Test event update without auth
        success, data = self.run_api_test(
            "Update event (no auth)", 
            "PUT", 
            "/planning/events/test-id", 
            401,
            event_data
        )
        
        # Test event deletion without auth
        success, data = self.run_api_test(
            "Delete event (no auth)", 
            "DELETE", 
            "/planning/events/test-id", 
            401
        )
        
        return True

    def test_data_structure_compatibility(self):
        """Test data structure compatibility issues"""
        print("\n🔍 Testing Data Structure Compatibility...")
        
        # Test that the API expects the correct field names
        # The review mentioned issues with start_time vs start, end_time vs end, status vs type
        
        # Test with old field names (should fail validation)
        old_format_event = {
            "description": "Test event",
            "client_id": "client-123",
            "client_name": "Test Client",
            "day": "monday",
            "start": "09:00",  # Old format
            "end": "17:00",    # Old format
            "type": "pending"  # Old format
        }
        
        success, data = self.run_api_test(
            "Create event with old field names (no auth)", 
            "POST", 
            "/planning/events", 
            401,  # Will fail auth first, but structure is important
            old_format_event
        )
        
        # Test with correct field names
        new_format_event = {
            "description": "Test event",
            "client_id": "client-123", 
            "client_name": "Test Client",
            "day": "monday",
            "start_time": "09:00",  # Correct format
            "end_time": "17:00",    # Correct format
            "status": "pending"     # Correct format
        }
        
        success, data = self.run_api_test(
            "Create event with correct field names (no auth)", 
            "POST", 
            "/planning/events", 
            401,  # Will fail auth first
            new_format_event
        )
        
        return True

    def test_event_creation_with_valid_data(self):
        """Test event creation with valid data structure"""
        print("\n🔍 Testing Event Creation with Valid Data (No Auth)...")
        
        # Test data from the request - using correct field names
        event_data = {
            "description": "Réunion client",
            "client_id": "client-456",
            "client_name": "Test Client",
            "day": "monday",
            "start_time": "09:00",
            "end_time": "10:00",
            "status": "pending"
        }
        
        # Should still fail with 401 due to no authentication
        success, data = self.run_api_test(
            "Create event with valid data (no auth)", 
            "POST", 
            "/planning/events", 
            401,
            event_data
        )
        
        return success

    def test_task_creation_with_valid_data(self):
        """Test task creation with valid data structure"""
        print("\n🔍 Testing Task Creation with Valid Data (No Auth)...")
        
        # Test data from the request
        task_data = {
            "name": "Développement",
            "price": 100.0,
            "color": "#FFB3E6",
            "icon": "💼",
            "time_slots": [{"day": "monday", "start": "09:00", "end": "10:00"}]
        }
        
        # Should still fail with 401 due to no authentication
        success, data = self.run_api_test(
            "Create task with valid data (no auth)", 
            "POST", 
            "/planning/tasks", 
            401,
            task_data
        )
        
        return success

    def test_cors_headers(self):
        """Test CORS configuration"""
        print("\n🔍 Testing CORS Configuration...")
        
        try:
            response = requests.options(f"{self.api_url}/", timeout=10)
            cors_headers = {
                'Access-Control-Allow-Origin': response.headers.get('Access-Control-Allow-Origin'),
                'Access-Control-Allow-Methods': response.headers.get('Access-Control-Allow-Methods'),
                'Access-Control-Allow-Headers': response.headers.get('Access-Control-Allow-Headers'),
            }
            
            success = any(cors_headers.values())
            details = f"CORS Headers: {cors_headers}"
            self.log_test("CORS Configuration", success, details)
            
        except Exception as e:
            self.log_test("CORS Configuration", False, f"Exception: {str(e)}")
        
        return True

    def run_all_tests(self):
        """Run all backend tests"""
        print("🚀 Starting Fleemy Backend API Tests")
        print(f"🌐 Testing against: {self.base_url}")
        print("=" * 60)
        
        # Run all test suites
        test_suites = [
            self.test_basic_connectivity,
            self.test_auth_endpoints,
            self.test_planning_endpoints_unauthorized,
            self.test_invalid_endpoints,
            self.test_data_validation,
            self.test_event_creation_with_valid_data,
            self.test_task_creation_with_valid_data,
            self.test_cors_headers,
        ]
        
        for test_suite in test_suites:
            try:
                test_suite()
            except Exception as e:
                print(f"❌ Test suite failed with exception: {str(e)}")
        
        # Print summary
        print("\n" + "=" * 60)
        print(f"📊 TEST SUMMARY")
        print(f"Tests Run: {self.tests_run}")
        print(f"Tests Passed: {self.tests_passed}")
        print(f"Tests Failed: {self.tests_run - self.tests_passed}")
        print(f"Success Rate: {(self.tests_passed/self.tests_run*100):.1f}%" if self.tests_run > 0 else "0%")
        
        if self.tests_passed == self.tests_run:
            print("🎉 All tests passed!")
            return 0
        else:
            print("⚠️  Some tests failed. Check the details above.")
            return 1

def main():
    """Main function to run the tests"""
    tester = FleemyAPITester()
    return tester.run_all_tests()

if __name__ == "__main__":
    sys.exit(main())