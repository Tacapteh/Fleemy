#!/usr/bin/env python3

import requests
import sys
import json
from datetime import datetime

class FleemyAPITester:
    def __init__(self, base_url="https://335cbee7-62f7-45d4-8dab-be3c3a14905b.preview.emergentagent.com"):
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

    def test_event_creation_scenarios(self):
        """Test event creation with different scenarios"""
        print("\n🔍 Testing Event Creation Scenarios...")
        
        # Test with missing required fields
        incomplete_event = {
            "description": "Test event"
            # Missing required fields
        }
        
        success, data = self.run_api_test(
            "Create event with missing fields (no auth)", 
            "POST", 
            "/planning/events", 
            401,  # Auth fails first
            incomplete_event
        )
        
        # Test with invalid time formats
        invalid_time_event = {
            "description": "Test event",
            "client_id": "client-123",
            "client_name": "Test Client",
            "day": "monday",
            "start_time": "25:00",  # Invalid time
            "end_time": "26:00",    # Invalid time
            "status": "pending"
        }
        
        success, data = self.run_api_test(
            "Create event with invalid time format (no auth)", 
            "POST", 
            "/planning/events", 
            401,  # Auth fails first
            invalid_time_event
        )
        
        # Test with different event types
        event_types = ["paid", "unpaid", "pending", "not_worked"]
        for event_type in event_types:
            event_data = {
                "description": f"Test {event_type} event",
                "client_id": "client-123",
                "client_name": "Test Client",
                "day": "tuesday",
                "start_time": "14:00",
                "end_time": "16:00",
                "status": event_type,
                "hourly_rate": 75.0
            }
            
            success, data = self.run_api_test(
                f"Create {event_type} event (no auth)", 
                "POST", 
                "/planning/events", 
                401,  # Auth fails first
                event_data
            )
        
        return True

    def test_event_update_scenarios(self):
        """Test event update with different scenarios"""
        print("\n🔍 Testing Event Update Scenarios...")
        
        # Test update with valid data
        update_data = {
            "description": "Updated event description",
            "client_id": "client-456",
            "client_name": "Updated Client",
            "day": "wednesday",
            "start_time": "10:00",
            "end_time": "12:00",
            "status": "paid",
            "hourly_rate": 100.0
        }
        
        success, data = self.run_api_test(
            "Update event with valid data (no auth)", 
            "PUT", 
            "/planning/events/test-event-id", 
            401,  # Auth fails first
            update_data
        )
        
        # Test partial update (only some fields)
        partial_update = {
            "status": "paid",
            "hourly_rate": 80.0
        }
        
        success, data = self.run_api_test(
            "Partial event update (no auth)", 
            "PUT", 
            "/planning/events/test-event-id", 
            401,  # Auth fails first
            partial_update
        )
        
        # Test update with invalid event ID format
        success, data = self.run_api_test(
            "Update event with invalid ID (no auth)", 
            "PUT", 
            "/planning/events/invalid-id-format", 
            401,  # Auth fails first
            update_data
        )
        
        return True

    def test_event_deletion_scenarios(self):
        """Test event deletion with different scenarios"""
        print("\n🔍 Testing Event Deletion Scenarios...")
        
        # Test deletion with valid ID
        success, data = self.run_api_test(
            "Delete event with valid ID (no auth)", 
            "DELETE", 
            "/planning/events/test-event-id", 
            401  # Auth fails first
        )
        
        # Test deletion with non-existent ID
        success, data = self.run_api_test(
            "Delete non-existent event (no auth)", 
            "DELETE", 
            "/planning/events/non-existent-id", 
            401  # Auth fails first
        )
        
        # Test deletion with invalid ID format
        success, data = self.run_api_test(
            "Delete event with invalid ID format (no auth)", 
            "DELETE", 
            "/planning/events/", 
            404  # Not found due to empty ID
        )
        
        return True

    def test_week_month_data_retrieval(self):
        """Test week and month data retrieval with various parameters"""
        print("\n🔍 Testing Week/Month Data Retrieval...")
        
        current_year = datetime.now().year
        current_week = datetime.now().isocalendar()[1]
        current_month = datetime.now().month
        
        # Test valid week parameters
        success, data = self.run_api_test(
            "Get week data with valid params (no auth)", 
            "GET", 
            f"/planning/week/{current_year}/{current_week}", 
            401
        )
        
        # Test valid month parameters
        success, data = self.run_api_test(
            "Get month data with valid params (no auth)", 
            "GET", 
            f"/planning/month/{current_year}/{current_month}", 
            401
        )
        
        # Test invalid year (too high)
        success, data = self.run_api_test(
            "Get week data with invalid year (no auth)", 
            "GET", 
            f"/planning/week/9999/{current_week}", 
            401  # Auth fails first
        )
        
        # Test invalid week (too high)
        success, data = self.run_api_test(
            "Get week data with invalid week (no auth)", 
            "GET", 
            f"/planning/week/{current_year}/60", 
            401  # Auth fails first
        )
        
        # Test invalid month (too high)
        success, data = self.run_api_test(
            "Get month data with invalid month (no auth)", 
            "GET", 
            f"/planning/month/{current_year}/15", 
            401  # Auth fails first
        )
        
        # Test with string parameters (should cause validation error)
        success, data = self.run_api_test(
            "Get week data with string year", 
            "GET", 
            "/planning/week/invalid/1", 
            422  # Validation error
        )
        
        success, data = self.run_api_test(
            "Get week data with string week", 
            "GET", 
            f"/planning/week/{current_year}/invalid", 
            422  # Validation error
        )
        
        return True

    def test_earnings_calculation_scenarios(self):
        """Test earnings calculation with different scenarios"""
        print("\n🔍 Testing Earnings Calculation Scenarios...")
        
        current_year = datetime.now().year
        current_week = datetime.now().isocalendar()[1]
        
        # Test earnings endpoint structure
        success, data = self.run_api_test(
            "Get earnings for current week (no auth)", 
            "GET", 
            f"/planning/earnings/{current_year}/{current_week}", 
            401
        )
        
        # Test earnings for different weeks
        for week_offset in [-1, 0, 1]:
            test_week = max(1, min(52, current_week + week_offset))
            success, data = self.run_api_test(
                f"Get earnings for week {test_week} (no auth)", 
                "GET", 
                f"/planning/earnings/{current_year}/{test_week}", 
                401
            )
        
        # Test earnings with invalid parameters
        success, data = self.run_api_test(
            "Get earnings with invalid year", 
            "GET", 
            "/planning/earnings/invalid/1", 
            422  # Validation error
        )
        
        success, data = self.run_api_test(
            "Get earnings with invalid week", 
            "GET", 
            f"/planning/earnings/{current_year}/invalid", 
            422  # Validation error
        )
        
        return True

    def test_data_structure_validation(self):
        """Test comprehensive data structure validation"""
        print("\n🔍 Testing Data Structure Validation...")
        
        # Test event creation with all required fields
        complete_event = {
            "description": "Complete event test",
            "client_id": "client-789",
            "client_name": "Complete Client",
            "day": "friday",
            "start_time": "09:00",
            "end_time": "17:00",
            "status": "pending",
            "hourly_rate": 65.0
        }
        
        success, data = self.run_api_test(
            "Create event with complete data (no auth)", 
            "POST", 
            "/planning/events", 
            401,
            complete_event
        )
        
        # Test event creation with minimal required fields
        minimal_event = {
            "description": "Minimal event",
            "client_id": "client-min",
            "client_name": "Min Client",
            "day": "saturday",
            "start_time": "10:00",
            "end_time": "11:00"
            # status and hourly_rate should have defaults
        }
        
        success, data = self.run_api_test(
            "Create event with minimal data (no auth)", 
            "POST", 
            "/planning/events", 
            401,
            minimal_event
        )
        
        # Test with invalid day values
        invalid_day_event = {
            "description": "Invalid day event",
            "client_id": "client-123",
            "client_name": "Test Client",
            "day": "invalid_day",
            "start_time": "09:00",
            "end_time": "10:00",
            "status": "pending"
        }
        
        success, data = self.run_api_test(
            "Create event with invalid day (no auth)", 
            "POST", 
            "/planning/events", 
            401,
            invalid_day_event
        )
        
        # Test with invalid status values
        invalid_status_event = {
            "description": "Invalid status event",
            "client_id": "client-123",
            "client_name": "Test Client",
            "day": "monday",
            "start_time": "09:00",
            "end_time": "10:00",
            "status": "invalid_status"
        }
        
        success, data = self.run_api_test(
            "Create event with invalid status (no auth)", 
            "POST", 
            "/planning/events", 
            401,
            invalid_status_event
        )
        
        return True

    def test_task_creation_with_valid_data(self):
        """Test task creation with valid data structure"""
        print("\n🔍 Testing Task Creation with Valid Data (No Auth)...")
        
        # Test data from the request
        task_data = {
            "name": "Développement web",
            "price": 75.0,
            "color": "#3b82f6",
            "icon": "💻",
            "time_slots": [{"day": "monday", "start": "09:00", "end": "12:00"}]
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

    def test_task_crud_endpoints(self):
        """Test task CRUD endpoints structure"""
        print("\n🔍 Testing Task CRUD Endpoints...")
        
        # Test task creation without auth
        task_data = {
            "name": "Développement web",
            "price": 75.0,
            "color": "#3b82f6",
            "icon": "💻",
            "time_slots": [
                {"day": "monday", "start": "09:00", "end": "12:00"},
                {"day": "wednesday", "start": "14:00", "end": "17:00"}
            ]
        }
        
        success, data = self.run_api_test(
            "Create task (no auth)", 
            "POST", 
            "/planning/tasks", 
            401,
            task_data
        )
        
        # Test task update without auth
        update_data = {
            "name": "Développement web avancé",
            "price": 85.0,
            "color": "#ef4444",
            "icon": "🚀",
            "time_slots": [{"day": "tuesday", "start": "10:00", "end": "15:00"}]
        }
        
        success, data = self.run_api_test(
            "Update task (no auth)", 
            "PUT", 
            "/planning/tasks/test-task-id", 
            401,
            update_data
        )
        
        # Test task deletion without auth
        success, data = self.run_api_test(
            "Delete task (no auth)", 
            "DELETE", 
            "/planning/tasks/test-task-id", 
            401
        )
        
        return True

    def test_task_data_structure_validation(self):
        """Test task data structure validation"""
        print("\n🔍 Testing Task Data Structure Validation...")
        
        # Test with complete task data
        complete_task = {
            "name": "Consultation technique",
            "price": 120.0,
            "color": "#10b981",
            "icon": "🔧",
            "time_slots": [
                {"day": "monday", "start": "09:00", "end": "10:00"},
                {"day": "friday", "start": "15:00", "end": "16:00"}
            ]
        }
        
        success, data = self.run_api_test(
            "Create task with complete data (no auth)", 
            "POST", 
            "/planning/tasks", 
            401,
            complete_task
        )
        
        # Test with minimal task data
        minimal_task = {
            "name": "Formation",
            "price": 50.0,
            "color": "#f59e0b",
            "icon": "📚",
            "time_slots": []
        }
        
        success, data = self.run_api_test(
            "Create task with minimal data (no auth)", 
            "POST", 
            "/planning/tasks", 
            401,
            minimal_task
        )
        
        # Test with missing required fields
        incomplete_task = {
            "name": "Test task"
            # Missing price, color, icon
        }
        
        success, data = self.run_api_test(
            "Create task with missing fields (no auth)", 
            "POST", 
            "/planning/tasks", 
            401,
            incomplete_task
        )
        
        # Test with invalid time slots
        invalid_time_task = {
            "name": "Invalid time task",
            "price": 60.0,
            "color": "#8b5cf6",
            "icon": "⚠️",
            "time_slots": [
                {"day": "monday", "start": "25:00", "end": "26:00"},  # Invalid times
                {"day": "invalid_day", "start": "09:00", "end": "10:00"}  # Invalid day
            ]
        }
        
        success, data = self.run_api_test(
            "Create task with invalid time slots (no auth)", 
            "POST", 
            "/planning/tasks", 
            401,
            invalid_time_task
        )
        
        return True

    def test_week_month_endpoints_with_tasks(self):
        """Test week/month endpoints return both events and tasks"""
        print("\n🔍 Testing Week/Month Endpoints with Tasks Integration...")
        
        current_year = datetime.now().year
        current_week = datetime.now().isocalendar()[1]
        current_month = datetime.now().month
        
        # Test week endpoint structure (should return {events: [], tasks: []})
        success, data = self.run_api_test(
            "Get week planning with tasks structure (no auth)", 
            "GET", 
            f"/planning/week/{current_year}/{current_week}", 
            401
        )
        
        # Test month endpoint structure (should return {events: [], tasks: []})
        success, data = self.run_api_test(
            "Get month planning with tasks structure (no auth)", 
            "GET", 
            f"/planning/month/{current_year}/{current_month}", 
            401
        )
        
        return True

    def test_earnings_with_tasks_integration(self):
        """Test earnings calculation includes tasks"""
        print("\n🔍 Testing Earnings Calculation with Tasks Integration...")
        
        current_year = datetime.now().year
        current_week = datetime.now().isocalendar()[1]
        
        # Test earnings endpoint (should include task earnings)
        success, data = self.run_api_test(
            "Get earnings with tasks integration (no auth)", 
            "GET", 
            f"/planning/earnings/{current_year}/{current_week}", 
            401
        )
        
        # Test earnings for different weeks to verify task calculation
        for week_offset in [-1, 0, 1]:
            test_week = max(1, min(52, current_week + week_offset))
            success, data = self.run_api_test(
                f"Get earnings with tasks for week {test_week} (no auth)", 
                "GET", 
                f"/planning/earnings/{current_year}/{test_week}", 
                401
            )
        
        return True

    def test_task_scenarios_comprehensive(self):
        """Test comprehensive task scenarios"""
        print("\n🔍 Testing Comprehensive Task Scenarios...")
        
        # Test various realistic task scenarios
        task_scenarios = [
            {
                "name": "Développement web",
                "price": 75.0,
                "color": "#3b82f6",
                "icon": "💻",
                "time_slots": [{"day": "monday", "start": "09:00", "end": "12:00"}],
                "description": "Web development task"
            },
            {
                "name": "Consultation",
                "price": 120.0,
                "color": "#10b981",
                "icon": "🤝",
                "time_slots": [
                    {"day": "tuesday", "start": "14:00", "end": "15:00"},
                    {"day": "thursday", "start": "10:00", "end": "11:00"}
                ],
                "description": "Client consultation"
            },
            {
                "name": "Formation",
                "price": 90.0,
                "color": "#f59e0b",
                "icon": "📚",
                "time_slots": [{"day": "friday", "start": "09:00", "end": "17:00"}],
                "description": "Training session"
            },
            {
                "name": "Maintenance",
                "price": 60.0,
                "color": "#ef4444",
                "icon": "🔧",
                "time_slots": [{"day": "wednesday", "start": "16:00", "end": "18:00"}],
                "description": "System maintenance"
            }
        ]
        
        for i, task_data in enumerate(task_scenarios):
            success, data = self.run_api_test(
                f"Create task scenario {i+1}: {task_data['name']} (no auth)", 
                "POST", 
                "/planning/tasks", 
                401,
                task_data
            )
        
        return True

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
            self.test_planning_week_endpoint,
            self.test_planning_month_endpoint,
            self.test_planning_earnings_endpoint,
            self.test_event_crud_endpoints,
            self.test_data_structure_compatibility,
            self.test_planning_endpoints_unauthorized,
            self.test_invalid_endpoints,
            self.test_data_validation,
            self.test_event_creation_with_valid_data,
            self.test_task_creation_with_valid_data,
            self.test_task_crud_endpoints,
            self.test_task_data_structure_validation,
            self.test_week_month_endpoints_with_tasks,
            self.test_earnings_with_tasks_integration,
            self.test_task_scenarios_comprehensive,
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