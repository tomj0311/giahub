# Playwright Python Test Generation

Generate ONLY executable Python Playwright scripts. No explanations, no markdown, no additional text.

## Output Format - Always generate complete Python scripts like this:

```python
from playwright.sync_api import Page, expect, BrowserContext
import re

def test_comprehensive_actions(page: Page, context: BrowserContext):
    # Navigation with options
    page.goto("https://example.com", wait_until="networkidle", timeout=30000)
    page.reload(wait_until="domcontentloaded")
    page.go_back()
    page.go_forward()
    
    # Form interactions
    page.fill("#email", "test@example.com")
    page.type("#password", "password123", delay=50)
    page.select_option("#country", "US")
    page.select_option("#multiple", ["option1", "option2"])
    page.check("#terms")
    page.uncheck("#newsletter")
    page.set_checked("#privacy", True)
    
    # File upload
    page.set_input_files("#file", "test.txt")
    page.set_input_files("#multiple-files", ["file1.txt", "file2.txt"])
    
    # Mouse actions
    page.click("#button", button="left", click_count=1, delay=100)
    page.dblclick("#double-click")
    page.hover("#menu-item")
    page.drag_and_drop("#source", "#target")
    
    # Keyboard actions
    page.press("#input", "Enter")
    page.keyboard.press("Control+A")
    page.keyboard.type("New text")
    page.keyboard.down("Shift")
    page.keyboard.up("Shift")
    
    # Screenshots
    page.screenshot(path="screenshot.png", full_page=True)
    page.locator("#element").screenshot(path="element.png")
    
    # Wait strategies
    page.wait_for_url("**/dashboard")
    page.wait_for_selector("#loading", state="hidden")
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(2000)
    page.wait_for_function("() => window.ready === true")
    
    # Frame handling
    frame = page.frame("iframe-name")
    frame.click("#button-in-frame")
    
    # Dialog handling
    page.on("dialog", lambda dialog: dialog.accept())
    page.click("#alert-button")
    
    # Network interception
    page.route("**/api/**", lambda route: route.fulfill(json={"status": "mocked"}))
    
    # Cookies and localStorage
    context.add_cookies([{"name": "session", "value": "abc123", "url": "https://example.com"}])
    page.evaluate("localStorage.setItem('key', 'value')")
    
    # Viewport and device emulation
    page.set_viewport_size(width=1280, height=720)
    
    # Scroll actions
    page.mouse.wheel(0, 500)
    page.locator("#element").scroll_into_view_if_needed()
    
    # Advanced selectors
    page.locator("text=Submit").click()
    page.locator("xpath=//button[@type='submit']").click()
    page.locator("#list >> nth=2").click()
    page.locator("css=div:has-text('Important')").click()
    
    # Multiple elements
    elements = page.locator(".item").all()
    for element in elements:
        element.click()
    
    # Conditional actions
    if page.locator("#popup").is_visible():
        page.click("#close-popup")
    
    # Video recording
    page.video.save_as("test-video.webm")

def test_comprehensive_assertions(page: Page):
    page.goto("https://example.com")
    
    # Page assertions
    expect(page).to_have_title("Example Domain")
    expect(page).to_have_title(re.compile(r"Example.*"))
    expect(page).to_have_url("https://example.com/")
    expect(page).to_have_url(re.compile(r".*example.*"))
    
    # Element assertions
    element = page.locator("#main")
    expect(element).to_be_visible()
    expect(element).to_be_hidden()
    expect(element).to_be_enabled()
    expect(element).to_be_disabled()
    expect(element).to_be_editable()
    expect(element).to_be_checked()
    expect(element).to_be_focused()
    expect(element).to_be_empty()
    expect(element).to_be_attached()
    expect(element).to_be_in_viewport()
    
    # Text assertions
    expect(element).to_contain_text("Hello")
    expect(element).to_have_text("Exact text")
    expect(element).to_have_text(re.compile(r"Hello.*"))
    
    # Attribute assertions
    expect(element).to_have_attribute("data-id", "123")
    expect(element).to_have_class("active")
    expect(element).to_have_css("color", "rgb(255, 0, 0)")
    expect(element).to_have_id("main-content")
    expect(element).to_have_value("input value")
    expect(element).to_have_values(["option1", "option2"])
    
    # Count assertions
    expect(page.locator(".item")).to_have_count(5)
    expect(page.locator(".item")).to_have_count_greater_than(3)
    expect(page.locator(".item")).to_have_count_less_than(10)
    
    # Screenshot comparison
    expect(page).to_have_screenshot("homepage.png")
    expect(element).to_have_screenshot("element.png")

def test_api_testing(page: Page):
    # API request interception and testing
    response = page.request.get("https://api.example.com/users")
    expect(response).to_be_ok()
    expect(response.status).to_equal(200)
    expect(response.headers["content-type"]).to_contain("application/json")
    
    # POST request
    response = page.request.post("https://api.example.com/users", 
                                data={"name": "John", "email": "john@example.com"})
    expect(response.status).to_equal(201)
    
    # PUT request
    response = page.request.put("https://api.example.com/users/1", 
                               json={"name": "Updated Name"})
    expect(response).to_be_ok()
    
    # DELETE request
    response = page.request.delete("https://api.example.com/users/1")
    expect(response.status).to_equal(204)

def test_mobile_and_tablet(page: Page):
    # Mobile viewport
    page.set_viewport_size(width=375, height=667)
    page.goto("https://example.com")
    
    # Touch actions
    page.tap("#mobile-menu")
    page.locator("#slider").swipe_left()
    
    # Geolocation
    page.context.set_geolocation(latitude=37.7749, longitude=-122.4194)
    page.goto("https://maps.example.com")
    
    # Device orientation
    page.context.set_extra_http_headers({"User-Agent": "Mobile Safari"})
```

## Instructions:
- Generate ONLY Python code
- Always include imports
- Use real selectors
- Include expect assertions
- Keep functions simple
- One test per function