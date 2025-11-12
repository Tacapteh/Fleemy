#!/usr/bin/env python3

import requests
import sys
import json
from datetime import datetime, timedelta
import calendar

class DashboardPlanningTester:
    def __init__(self, base_url="https://money-manager-1265.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.test_token = "test-token-123"  # Test token from server.py
        self.tests_run = 0
        self.tests_passed = 0
        self.created_events = []
        self.created_tasks = []

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
        """Run a single API test with authentication"""
        url = f"{self.api_url}{endpoint}"
        test_headers = {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {self.test_token}'
        }
        
        if headers:
            test_headers.update(headers)

        try:
            if method == 'GET':
                response = requests.get(url, headers=test_headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=test_headers, timeout=10)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=test_headers, timeout=10)
            elif method == 'PATCH':
                response = requests.patch(url, json=data, headers=test_headers, timeout=10)
            elif method == 'DELETE':
                response = requests.delete(url, headers=test_headers, timeout=10)

            success = response.status_code == expected_status
            details = f"Status: {response.status_code}"
            
            if success:
                try:
                    response_data = response.json()
                    details += f", Response keys: {list(response_data.keys())}"
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

    def test_auth_me_endpoint(self):
        """Test authentication endpoint"""
        print("\n🔍 Testing Authentication...")
        
        success, data = self.run_api_test(
            "Get authenticated user info",
            "GET",
            "/auth/me",
            200
        )
        
        if success and data:
            print(f"   User authenticated: {data.get('user', {}).get('uid', 'Unknown')}")
        
        return success

    def create_test_event(self, description="Test Event", day="monday", start="09:00", end="10:00", status="pending"):
        """Create a test event for testing"""
        current_year = datetime.now().year
        current_week = datetime.now().isocalendar()[1]
        
        event_data = {
            "description": description,
            "client_id": "test-client-123",
            "client_name": "Client Test Dashboard",
            "day": day,
            "start_time": start,
            "end_time": end,
            "status": status,
            "hourly_rate": 75.0,
            "year": current_year,
            "week": current_week
        }
        
        success, data = self.run_api_test(
            f"Create test event: {description}",
            "POST",
            "/planning/events",
            200,
            event_data
        )
        
        if success and data.get("success") and data.get("event"):
            event_id = data["event"]["id"]
            self.created_events.append(event_id)
            print(f"   Created event ID: {event_id}")
            return event_id
        
        return None

    def create_test_task(self, name="Test Task", price=60.0, day="tuesday", start="14:00", end="16:00"):
        """Create a test task for testing"""
        current_year = datetime.now().year
        current_week = datetime.now().isocalendar()[1]
        
        task_data = {
            "name": name,
            "price": price,
            "color": "#3b82f6",
            "icon": "💻",
            "time_slots": [{"day": day, "start": start, "end": end}],
            "year": current_year,
            "week": current_week
        }
        
        success, data = self.run_api_test(
            f"Create test task: {name}",
            "POST",
            "/planning/tasks",
            200,
            task_data
        )
        
        if success and data.get("success") and data.get("task"):
            task_id = data["task"]["id"]
            self.created_tasks.append(task_id)
            print(f"   Created task ID: {task_id}")
            return task_id
        
        return None

    def test_planning_week_endpoint_structure(self):
        """Test GET /api/planning/week/{year}/{week} endpoint structure"""
        print("\n🔍 Testing Planning Week Endpoint Structure...")
        
        current_year = datetime.now().year
        current_week = datetime.now().isocalendar()[1]
        
        success, data = self.run_api_test(
            "Get week planning data structure",
            "GET",
            f"/planning/week/{current_year}/{current_week}",
            200
        )
        
        if success and data:
            # Verify response structure
            required_keys = ["success", "events", "tasks"]
            missing_keys = [key for key in required_keys if key not in data]
            
            if not missing_keys:
                self.log_test("Week endpoint has required keys", True, f"Keys: {required_keys}")
                
                # Verify success is True
                if data.get("success") is True:
                    self.log_test("Week endpoint success field is True", True)
                else:
                    self.log_test("Week endpoint success field is True", False, f"Got: {data.get('success')}")
                
                # Verify events and tasks are lists
                events_is_list = isinstance(data.get("events"), list)
                tasks_is_list = isinstance(data.get("tasks"), list)
                
                self.log_test("Week endpoint events is list", events_is_list, f"Type: {type(data.get('events'))}")
                self.log_test("Week endpoint tasks is list", tasks_is_list, f"Type: {type(data.get('tasks'))}")
                
                print(f"   Found {len(data.get('events', []))} events and {len(data.get('tasks', []))} tasks")
                
            else:
                self.log_test("Week endpoint has required keys", False, f"Missing: {missing_keys}")
        
        return success

    def test_planning_month_endpoint_structure(self):
        """Test GET /api/planning/month/{year}/{month} endpoint structure"""
        print("\n🔍 Testing Planning Month Endpoint Structure...")
        
        current_year = datetime.now().year
        current_month = datetime.now().month
        
        success, data = self.run_api_test(
            "Get month planning data structure",
            "GET",
            f"/planning/month/{current_year}/{current_month}",
            200
        )
        
        if success and data:
            # Verify response structure
            required_keys = ["success", "events", "tasks"]
            missing_keys = [key for key in required_keys if key not in data]
            
            if not missing_keys:
                self.log_test("Month endpoint has required keys", True, f"Keys: {required_keys}")
                
                # Verify success is True
                if data.get("success") is True:
                    self.log_test("Month endpoint success field is True", True)
                else:
                    self.log_test("Month endpoint success field is True", False, f"Got: {data.get('success')}")
                
                # Verify events and tasks are lists
                events_is_list = isinstance(data.get("events"), list)
                tasks_is_list = isinstance(data.get("tasks"), list)
                
                self.log_test("Month endpoint events is list", events_is_list, f"Type: {type(data.get('events'))}")
                self.log_test("Month endpoint tasks is list", tasks_is_list, f"Type: {type(data.get('tasks'))}")
                
                print(f"   Found {len(data.get('events', []))} events and {len(data.get('tasks', []))} tasks")
                
            else:
                self.log_test("Month endpoint has required keys", False, f"Missing: {missing_keys}")
        
        return success

    def test_planning_earnings_endpoint_structure(self):
        """Test GET /api/planning/earnings/{year}/{week} endpoint structure"""
        print("\n🔍 Testing Planning Earnings Endpoint Structure...")
        
        current_year = datetime.now().year
        current_week = datetime.now().isocalendar()[1]
        
        success, data = self.run_api_test(
            "Get earnings data structure",
            "GET",
            f"/planning/earnings/{current_year}/{current_week}",
            200
        )
        
        if success and data:
            # Verify response structure
            required_keys = ["success", "earnings"]
            missing_keys = [key for key in required_keys if key not in data]
            
            if not missing_keys:
                self.log_test("Earnings endpoint has required keys", True, f"Keys: {required_keys}")
                
                # Verify success is True
                if data.get("success") is True:
                    self.log_test("Earnings endpoint success field is True", True)
                else:
                    self.log_test("Earnings endpoint success field is True", False, f"Got: {data.get('success')}")
                
                # Verify earnings structure
                earnings = data.get("earnings", {})
                if isinstance(earnings, dict):
                    required_earnings_keys = ["paid", "pending", "unpaid", "total"]
                    missing_earnings_keys = [key for key in required_earnings_keys if key not in earnings]
                    
                    if not missing_earnings_keys:
                        self.log_test("Earnings has required fields", True, f"Keys: {required_earnings_keys}")
                        
                        # Verify all values are numbers
                        all_numbers = all(isinstance(earnings.get(key), (int, float)) for key in required_earnings_keys)
                        self.log_test("Earnings values are numbers", all_numbers, f"Values: {earnings}")
                        
                        print(f"   Earnings: Paid={earnings.get('paid', 0)}, Pending={earnings.get('pending', 0)}, Unpaid={earnings.get('unpaid', 0)}, Total={earnings.get('total', 0)}")
                        
                    else:
                        self.log_test("Earnings has required fields", False, f"Missing: {missing_earnings_keys}")
                else:
                    self.log_test("Earnings is object", False, f"Type: {type(earnings)}")
                
            else:
                self.log_test("Earnings endpoint has required keys", False, f"Missing: {missing_keys}")
        
        return success

    def test_event_data_structure(self):
        """Test event data structure in responses"""
        print("\n🔍 Testing Event Data Structure...")
        
        # Create a test event first
        event_id = self.create_test_event("Structure Test Event", "wednesday", "11:00", "12:00", "paid")
        
        if event_id:
            current_year = datetime.now().year
            current_week = datetime.now().isocalendar()[1]
            
            # Get week data and check event structure
            success, data = self.run_api_test(
                "Get week data to check event structure",
                "GET",
                f"/planning/week/{current_year}/{current_week}",
                200
            )
            
            if success and data.get("events"):
                events = data["events"]
                test_event = None
                
                # Find our test event
                for event in events:
                    if event.get("id") == event_id:
                        test_event = event
                        break
                
                if test_event:
                    # Check required event fields
                    required_event_fields = ["id", "year", "week", "day", "start_time", "end_time", "status", "client_name", "description"]
                    missing_fields = [field for field in required_event_fields if field not in test_event]
                    
                    if not missing_fields:
                        self.log_test("Event has required fields", True, f"Fields: {required_event_fields}")
                        
                        # Verify field values
                        self.log_test("Event year is number", isinstance(test_event.get("year"), int), f"Year: {test_event.get('year')}")
                        self.log_test("Event week is number", isinstance(test_event.get("week"), int), f"Week: {test_event.get('week')}")
                        self.log_test("Event day is string", isinstance(test_event.get("day"), str), f"Day: {test_event.get('day')}")
                        self.log_test("Event status is string", isinstance(test_event.get("status"), str), f"Status: {test_event.get('status')}")
                        
                    else:
                        self.log_test("Event has required fields", False, f"Missing: {missing_fields}")
                else:
                    self.log_test("Find created event in response", False, f"Event ID {event_id} not found")
        
        return True

    def test_task_data_structure(self):
        """Test task data structure in responses"""
        print("\n🔍 Testing Task Data Structure...")
        
        # Create a test task first
        task_id = self.create_test_task("Structure Test Task", 80.0, "thursday", "15:00", "17:00")
        
        if task_id:
            current_year = datetime.now().year
            current_week = datetime.now().isocalendar()[1]
            
            # Get week data and check task structure
            success, data = self.run_api_test(
                "Get week data to check task structure",
                "GET",
                f"/planning/week/{current_year}/{current_week}",
                200
            )
            
            if success and data.get("tasks"):
                tasks = data["tasks"]
                test_task = None
                
                # Find our test task
                for task in tasks:
                    if task.get("id") == task_id:
                        test_task = task
                        break
                
                if test_task:
                    # Check required task fields
                    required_task_fields = ["id", "year", "week", "name", "price", "time_slots"]
                    missing_fields = [field for field in required_task_fields if field not in test_task]
                    
                    if not missing_fields:
                        self.log_test("Task has required fields", True, f"Fields: {required_task_fields}")
                        
                        # Verify field values
                        self.log_test("Task year is number", isinstance(test_task.get("year"), int), f"Year: {test_task.get('year')}")
                        self.log_test("Task week is number", isinstance(test_task.get("week"), int), f"Week: {test_task.get('week')}")
                        self.log_test("Task name is string", isinstance(test_task.get("name"), str), f"Name: {test_task.get('name')}")
                        self.log_test("Task price is number", isinstance(test_task.get("price"), (int, float)), f"Price: {test_task.get('price')}")
                        self.log_test("Task time_slots is list", isinstance(test_task.get("time_slots"), list), f"Time slots: {len(test_task.get('time_slots', []))}")
                        
                        # Check time_slots structure
                        time_slots = test_task.get("time_slots", [])
                        if time_slots:
                            slot = time_slots[0]
                            required_slot_fields = ["day", "start", "end"]
                            missing_slot_fields = [field for field in required_slot_fields if field not in slot]
                            
                            if not missing_slot_fields:
                                self.log_test("Task time_slot has required fields", True, f"Fields: {required_slot_fields}")
                            else:
                                self.log_test("Task time_slot has required fields", False, f"Missing: {missing_slot_fields}")
                        
                    else:
                        self.log_test("Task has required fields", False, f"Missing: {missing_fields}")
                else:
                    self.log_test("Find created task in response", False, f"Task ID {task_id} not found")
        
        return True

    def test_earnings_calculation_accuracy(self):
        """Test earnings calculation accuracy with known data"""
        print("\n🔍 Testing Earnings Calculation Accuracy...")
        
        current_year = datetime.now().year
        current_week = datetime.now().isocalendar()[1]
        
        # Create events with known values for calculation testing
        test_events = [
            ("Paid Event 1", "monday", "09:00", "12:00", "paid", 75.0),    # 3 hours * 75 = 225
            ("Paid Event 2", "tuesday", "14:00", "16:00", "paid", 100.0),  # 2 hours * 100 = 200
            ("Unpaid Event", "wednesday", "10:00", "13:00", "unpaid", 80.0), # 3 hours * 80 = 240
            ("Pending Event", "thursday", "15:00", "17:00", "pending", 90.0), # 2 hours * 90 = 180
        ]
        
        created_event_ids = []
        expected_paid = 0
        expected_unpaid = 0
        expected_pending = 0
        
        for desc, day, start, end, status, rate in test_events:
            event_data = {
                "description": desc,
                "client_id": "test-client-calc",
                "client_name": "Calculation Test Client",
                "day": day,
                "start_time": start,
                "end_time": end,
                "status": status,
                "hourly_rate": rate,
                "year": current_year,
                "week": current_week
            }
            
            success, data = self.run_api_test(
                f"Create calculation test event: {desc}",
                "POST",
                "/planning/events",
                200,
                event_data
            )
            
            if success and data.get("success"):
                created_event_ids.append(data["event"]["id"])
                
                # Calculate expected earnings
                start_hour = int(start.split(":")[0])
                end_hour = int(end.split(":")[0])
                hours = end_hour - start_hour
                amount = hours * rate
                
                if status == "paid":
                    expected_paid += amount
                elif status == "unpaid":
                    expected_unpaid += amount
                elif status == "pending":
                    expected_pending += amount
        
        # Create a test task for task earnings calculation
        task_data = {
            "name": "Calculation Test Task",
            "price": 50.0,  # 50 per hour
            "color": "#10b981",
            "icon": "🧮",
            "time_slots": [{"day": "friday", "start": "09:00", "end": "11:00"}],  # 2 hours * 50 = 100
            "year": current_year,
            "week": current_week
        }
        
        success, data = self.run_api_test(
            "Create calculation test task",
            "POST",
            "/planning/tasks",
            200,
            task_data
        )
        
        if success and data.get("success"):
            created_task_ids = [data["task"]["id"]]
            expected_paid += 100  # Tasks are always considered "paid"
        else:
            created_task_ids = []
        
        expected_total = expected_paid + expected_unpaid + expected_pending
        
        print(f"   Expected earnings: Paid={expected_paid}, Unpaid={expected_unpaid}, Pending={expected_pending}, Total={expected_total}")
        
        # Now get earnings and verify calculation
        success, data = self.run_api_test(
            "Get earnings for calculation verification",
            "GET",
            f"/planning/earnings/{current_year}/{current_week}",
            200
        )
        
        if success and data.get("earnings"):
            earnings = data["earnings"]
            actual_paid = earnings.get("paid", 0)
            actual_unpaid = earnings.get("unpaid", 0)
            actual_pending = earnings.get("pending", 0)
            actual_total = earnings.get("total", 0)
            
            print(f"   Actual earnings: Paid={actual_paid}, Unpaid={actual_unpaid}, Pending={actual_pending}, Total={actual_total}")
            
            # Note: We can't do exact comparison because there might be other events/tasks
            # But we can verify that our test data contributed correctly
            self.log_test("Earnings calculation includes test data", 
                         actual_paid >= expected_paid and actual_total >= expected_total,
                         f"Expected at least: Paid>={expected_paid}, Total>={expected_total}")
        
        # Cleanup created test data
        for event_id in created_event_ids:
            self.run_api_test(f"Cleanup test event {event_id}", "DELETE", f"/planning/events/{event_id}", 200)
        
        for task_id in created_task_ids:
            self.run_api_test(f"Cleanup test task {task_id}", "DELETE", f"/planning/tasks/{task_id}", 200)
        
        return True

    def test_different_time_periods(self):
        """Test endpoints with different time periods"""
        print("\n🔍 Testing Different Time Periods...")
        
        current_date = datetime.now()
        current_year = current_date.year
        current_week = current_date.isocalendar()[1]
        current_month = current_date.month
        
        # Test current week
        success, data = self.run_api_test(
            "Get current week planning",
            "GET",
            f"/planning/week/{current_year}/{current_week}",
            200
        )
        
        # Test previous week
        prev_week = current_week - 1 if current_week > 1 else 52
        prev_year = current_year if current_week > 1 else current_year - 1
        
        success, data = self.run_api_test(
            "Get previous week planning",
            "GET",
            f"/planning/week/{prev_year}/{prev_week}",
            200
        )
        
        # Test next week
        next_week = current_week + 1 if current_week < 52 else 1
        next_year = current_year if current_week < 52 else current_year + 1
        
        success, data = self.run_api_test(
            "Get next week planning",
            "GET",
            f"/planning/week/{next_year}/{next_week}",
            200
        )
        
        # Test current month
        success, data = self.run_api_test(
            "Get current month planning",
            "GET",
            f"/planning/month/{current_year}/{current_month}",
            200
        )
        
        # Test previous month
        prev_month = current_month - 1 if current_month > 1 else 12
        prev_month_year = current_year if current_month > 1 else current_year - 1
        
        success, data = self.run_api_test(
            "Get previous month planning",
            "GET",
            f"/planning/month/{prev_month_year}/{prev_month}",
            200
        )
        
        # Test next month
        next_month = current_month + 1 if current_month < 12 else 1
        next_month_year = current_year if current_month < 12 else current_year + 1
        
        success, data = self.run_api_test(
            "Get next month planning",
            "GET",
            f"/planning/month/{next_month_year}/{next_month}",
            200
        )
        
        # Test earnings for different weeks
        for week_offset in [-1, 0, 1]:
            test_week = max(1, min(52, current_week + week_offset))
            test_year = current_year
            
            success, data = self.run_api_test(
                f"Get earnings for week {test_week}",
                "GET",
                f"/planning/earnings/{test_year}/{test_week}",
                200
            )
        
        return True

    def test_edge_cases(self):
        """Test edge cases and boundary conditions"""
        print("\n🔍 Testing Edge Cases...")
        
        current_year = datetime.now().year
        
        # Test week 1 and week 52
        success, data = self.run_api_test(
            "Get week 1 planning",
            "GET",
            f"/planning/week/{current_year}/1",
            200
        )
        
        success, data = self.run_api_test(
            "Get week 52 planning",
            "GET",
            f"/planning/week/{current_year}/52",
            200
        )
        
        # Test month 1 and month 12
        success, data = self.run_api_test(
            "Get January planning",
            "GET",
            f"/planning/month/{current_year}/1",
            200
        )
        
        success, data = self.run_api_test(
            "Get December planning",
            "GET",
            f"/planning/month/{current_year}/12",
            200
        )
        
        # Test invalid parameters (should return validation errors)
        success, data = self.run_api_test(
            "Get invalid week (0)",
            "GET",
            f"/planning/week/{current_year}/0",
            422  # Validation error expected
        )
        
        success, data = self.run_api_test(
            "Get invalid week (53)",
            "GET",
            f"/planning/week/{current_year}/53",
            422  # Validation error expected
        )
        
        success, data = self.run_api_test(
            "Get invalid month (0)",
            "GET",
            f"/planning/month/{current_year}/0",
            422  # Validation error expected
        )
        
        success, data = self.run_api_test(
            "Get invalid month (13)",
            "GET",
            f"/planning/month/{current_year}/13",
            422  # Validation error expected
        )
        
        return True

    def cleanup_test_data(self):
        """Clean up created test data"""
        print("\n🧹 Cleaning up test data...")
        
        # Delete created events
        for event_id in self.created_events:
            success, data = self.run_api_test(
                f"Delete test event {event_id}",
                "DELETE",
                f"/planning/events/{event_id}",
                200
            )
        
        # Delete created tasks
        for task_id in self.created_tasks:
            success, data = self.run_api_test(
                f"Delete test task {task_id}",
                "DELETE",
                f"/planning/tasks/{task_id}",
                200
            )
        
        print(f"   Cleaned up {len(self.created_events)} events and {len(self.created_tasks)} tasks")

    def run_dashboard_planning_tests(self):
        """Run all dashboard planning tests"""
        print("🚀 Starting Dashboard Planning API Tests")
        print(f"🌐 Testing against: {self.base_url}")
        print("📋 Focus: Planning endpoints for Dashboard")
        print("=" * 60)
        
        # Test authentication first
        if not self.test_auth_me_endpoint():
            print("❌ Authentication failed - cannot proceed with authenticated tests")
            return 1
        
        # Run planning endpoint tests
        test_suites = [
            self.test_planning_week_endpoint_structure,
            self.test_planning_month_endpoint_structure,
            self.test_planning_earnings_endpoint_structure,
            self.test_event_data_structure,
            self.test_task_data_structure,
            self.test_earnings_calculation_accuracy,
            self.test_different_time_periods,
            self.test_edge_cases,
        ]
        
        for test_suite in test_suites:
            try:
                test_suite()
            except Exception as e:
                print(f"❌ Test suite failed with exception: {str(e)}")
        
        # Cleanup
        self.cleanup_test_data()
        
        # Print summary
        print("\n" + "=" * 60)
        print(f"📊 DASHBOARD PLANNING TEST SUMMARY")
        print(f"Tests Run: {self.tests_run}")
        print(f"Tests Passed: {self.tests_passed}")
        print(f"Tests Failed: {self.tests_run - self.tests_passed}")
        print(f"Success Rate: {(self.tests_passed/self.tests_run*100):.1f}%" if self.tests_run > 0 else "0%")
        
        if self.tests_passed == self.tests_run:
            print("🎉 All dashboard planning tests passed!")
            return 0
        else:
            print("⚠️  Some tests failed. Check the details above.")
            return 1

def main():
    """Main function to run the dashboard planning tests"""
    tester = DashboardPlanningTester()
    return tester.run_dashboard_planning_tests()

if __name__ == "__main__":
    sys.exit(main())