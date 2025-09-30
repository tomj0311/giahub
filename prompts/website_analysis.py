#!/usr/bin/env python3
"""
Website Analysis Script for AI Agents
=====================================

This script provides comprehensive website analysis capabilities using Playwright.
It extracts structured information that AI agents can understand and process.

Why Playwright over Beautiful Soup:
- Handles JavaScript-rendered content (SPAs, dynamic content)
- Captures screenshots for visual analysis
- Can interact with elements and track network requests
- Gets final DOM state after all scripts execute
- Better for modern websites with complex interactions

Usage:
    python website_analysis.py <url>
    python website_analysis.py https://example.com
"""

import asyncio
import json
import re
import sys
import time
from pathlib import Path
from typing import Dict, List, Optional, Any
from urllib.parse import urljoin, urlparse

from playwright.async_api import async_playwright, Page, Browser, Response


class WebsiteAnalyzer:
    """Comprehensive website analyzer using Playwright"""
    
    def __init__(self, headless: bool = True, timeout: int = 30000):
        self.headless = headless
        self.timeout = timeout
        self.analysis_data = {}
        
    async def analyze_website(self, url: str) -> Dict[str, Any]:
        """Main method to analyze a website comprehensively"""
        
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=self.headless)
            context = await browser.new_context(
                viewport={'width': 1920, 'height': 1080},
                user_agent='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            )
            
            page = await context.new_page()
            
            # Track network requests
            requests = []
            responses = []
            
            async def handle_request(request):
                requests.append({
                    'url': request.url,
                    'method': request.method,
                    'resource_type': request.resource_type,
                    'headers': dict(request.headers)
                })
            
            async def handle_response(response):
                responses.append({
                    'url': response.url,
                    'status': response.status,
                    'headers': dict(response.headers),
                    'size': await self._get_response_size(response)
                })
            
            page.on('request', handle_request)
            page.on('response', handle_response)
            
            try:
                # Navigate to the page
                await page.goto(url, wait_until='networkidle', timeout=self.timeout)
                
                # Perform comprehensive analysis
                analysis = {
                    'url': url,
                    'timestamp': time.time(),
                    'basic_info': await self._extract_basic_info(page),
                    'content': await self._extract_content(page),
                    'structure': await self._extract_structure(page),
                    'seo': await self._extract_seo_data(page),
                    'forms': await self._extract_forms(page),
                    'links': await self._extract_links(page, url),
                    'images': await self._extract_images(page, url),
                    'scripts': await self._extract_scripts(page),
                    'styles': await self._extract_styles(page),
                    'performance': await self._extract_performance(page),
                    'accessibility': await self._extract_accessibility(page),
                    'security': await self._extract_security_info(page),
                    'technology': await self._detect_technologies(page),
                    'network': {
                        'requests': requests,
                        'responses': responses
                    },
                    'screenshots': await self._capture_screenshots(page)
                }
                
                return analysis
                
            except Exception as e:
                return {'error': str(e), 'url': url}
            finally:
                await browser.close()
    
    async def _extract_basic_info(self, page: Page) -> Dict[str, Any]:
        """Extract basic page information"""
        return {
            'title': await page.title(),
            'url': page.url,
            'viewport': await page.viewport_size(),
            'user_agent': await page.evaluate('navigator.userAgent'),
            'language': await page.evaluate('document.documentElement.lang'),
            'charset': await page.evaluate('document.characterSet'),
            'ready_state': await page.evaluate('document.readyState'),
            'cookie_enabled': await page.evaluate('navigator.cookieEnabled'),
            'online': await page.evaluate('navigator.onLine')
        }
    
    async def _extract_content(self, page: Page) -> Dict[str, Any]:
        """Extract text content and structure"""
        
        # Get all text content
        body_text = await page.locator('body').inner_text()
        
        # Extract headings with hierarchy
        headings = []
        for level in range(1, 7):
            heading_elements = await page.locator(f'h{level}').all()
            for element in heading_elements:
                text = await element.inner_text()
                if text.strip():
                    headings.append({
                        'level': level,
                        'text': text.strip(),
                        'id': await element.get_attribute('id'),
                        'class': await element.get_attribute('class')
                    })
        
        # Extract paragraphs
        paragraphs = []
        paragraph_elements = await page.locator('p').all()
        for element in paragraph_elements:
            text = await element.inner_text()
            if text.strip():
                paragraphs.append(text.strip())
        
        # Extract lists
        lists = []
        list_elements = await page.locator('ul, ol').all()
        for element in list_elements:
            list_items = await element.locator('li').all()
            items = []
            for item in list_items:
                text = await item.inner_text()
                if text.strip():
                    items.append(text.strip())
            if items:
                lists.append({
                    'type': await element.evaluate('this.tagName.toLowerCase()'),
                    'items': items
                })
        
        return {
            'full_text': body_text,
            'word_count': len(body_text.split()),
            'char_count': len(body_text),
            'headings': headings,
            'paragraphs': paragraphs,
            'lists': lists,
            'tables': await self._extract_tables(page)
        }
    
    async def _extract_structure(self, page: Page) -> Dict[str, Any]:
        """Extract HTML structure information"""
        
        # Get DOM stats
        element_counts = await page.evaluate('''
            () => {
                const tags = {};
                const elements = document.querySelectorAll('*');
                elements.forEach(el => {
                    const tag = el.tagName.toLowerCase();
                    tags[tag] = (tags[tag] || 0) + 1;
                });
                return {
                    total_elements: elements.length,
                    tags: tags,
                    depth: Math.max(...Array.from(elements).map(el => {
                        let depth = 0;
                        let parent = el.parentElement;
                        while (parent) {
                            depth++;
                            parent = parent.parentElement;
                        }
                        return depth;
                    }))
                };
            }
        ''')
        
        # Extract navigation
        nav_elements = await page.locator('nav, [role="navigation"]').all()
        navigation = []
        for nav in nav_elements:
            links = await nav.locator('a').all()
            nav_links = []
            for link in links:
                href = await link.get_attribute('href')
                text = await link.inner_text()
                if text.strip():
                    nav_links.append({
                        'text': text.strip(),
                        'href': href
                    })
            if nav_links:
                navigation.append({
                    'id': await nav.get_attribute('id'),
                    'class': await nav.get_attribute('class'),
                    'links': nav_links
                })
        
        return {
            'element_counts': element_counts,
            'navigation': navigation,
            'main_content': await self._find_main_content(page),
            'sidebar': await self._find_sidebar(page),
            'footer': await self._find_footer(page)
        }
    
    async def _extract_seo_data(self, page: Page) -> Dict[str, Any]:
        """Extract SEO-related information"""
        
        # Meta tags
        meta_tags = await page.evaluate('''
            () => {
                const metas = {};
                document.querySelectorAll('meta').forEach(meta => {
                    const name = meta.getAttribute('name') || meta.getAttribute('property') || meta.getAttribute('http-equiv');
                    const content = meta.getAttribute('content');
                    if (name && content) {
                        metas[name] = content;
                    }
                });
                return metas;
            }
        ''')
        
        # Structured data
        structured_data = await page.evaluate('''
            () => {
                const scripts = document.querySelectorAll('script[type="application/ld+json"]');
                const data = [];
                scripts.forEach(script => {
                    try {
                        data.push(JSON.parse(script.textContent));
                    } catch (e) {
                        // Invalid JSON, skip
                    }
                });
                return data;
            }
        ''')
        
        # Open Graph data
        og_data = {}
        for tag in ['og:title', 'og:description', 'og:image', 'og:url', 'og:type', 'og:site_name']:
            try:
                content = await page.get_attribute(f'meta[property="{tag}"]', 'content')
                if content:
                    og_data[tag] = content
            except:
                pass
        
        # Twitter Card data
        twitter_data = {}
        for tag in ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image', 'twitter:site']:
            try:
                content = await page.get_attribute(f'meta[name="{tag}"]', 'content')
                if content:
                    twitter_data[tag] = content
            except:
                pass
        
        return {
            'title': await page.title(),
            'meta_tags': meta_tags,
            'structured_data': structured_data,
            'open_graph': og_data,
            'twitter_card': twitter_data,
            'canonical': await page.get_attribute('link[rel="canonical"]', 'href'),
            'robots': meta_tags.get('robots', ''),
            'description': meta_tags.get('description', ''),
            'keywords': meta_tags.get('keywords', '')
        }
    
    async def _extract_forms(self, page: Page) -> List[Dict[str, Any]]:
        """Extract form information"""
        forms = []
        form_elements = await page.locator('form').all()
        
        for form in form_elements:
            form_data = {
                'action': await form.get_attribute('action'),
                'method': await form.get_attribute('method') or 'GET',
                'enctype': await form.get_attribute('enctype'),
                'id': await form.get_attribute('id'),
                'class': await form.get_attribute('class'),
                'fields': []
            }
            
            # Extract form fields
            field_elements = await form.locator('input, textarea, select').all()
            for field in field_elements:
                field_data = {
                    'tag': await field.evaluate('this.tagName.toLowerCase()'),
                    'type': await field.get_attribute('type'),
                    'name': await field.get_attribute('name'),
                    'id': await field.get_attribute('id'),
                    'placeholder': await field.get_attribute('placeholder'),
                    'required': await field.get_attribute('required') is not None,
                    'value': await field.get_attribute('value')
                }
                form_data['fields'].append(field_data)
            
            forms.append(form_data)
        
        return forms
    
    async def _extract_links(self, page: Page, base_url: str) -> Dict[str, Any]:
        """Extract all links and categorize them"""
        link_elements = await page.locator('a[href]').all()
        
        internal_links = []
        external_links = []
        email_links = []
        tel_links = []
        
        base_domain = urlparse(base_url).netloc
        
        for link in link_elements:
            href = await link.get_attribute('href')
            text = await link.inner_text()
            title = await link.get_attribute('title')
            
            if not href:
                continue
            
            link_data = {
                'href': href,
                'text': text.strip() if text else '',
                'title': title,
                'target': await link.get_attribute('target'),
                'rel': await link.get_attribute('rel')
            }
            
            if href.startswith('mailto:'):
                email_links.append(link_data)
            elif href.startswith('tel:'):
                tel_links.append(link_data)
            elif href.startswith('http'):
                parsed = urlparse(href)
                if parsed.netloc == base_domain:
                    internal_links.append(link_data)
                else:
                    external_links.append(link_data)
            else:
                # Relative link, treat as internal
                internal_links.append(link_data)
        
        return {
            'total_links': len(link_elements),
            'internal': internal_links,
            'external': external_links,
            'email': email_links,
            'tel': tel_links
        }
    
    async def _extract_images(self, page: Page, base_url: str) -> Dict[str, Any]:
        """Extract image information"""
        img_elements = await page.locator('img').all()
        
        images = []
        for img in img_elements:
            src = await img.get_attribute('src')
            if src:
                # Convert relative URLs to absolute
                if not src.startswith('http'):
                    src = urljoin(base_url, src)
                
                images.append({
                    'src': src,
                    'alt': await img.get_attribute('alt'),
                    'title': await img.get_attribute('title'),
                    'width': await img.get_attribute('width'),
                    'height': await img.get_attribute('height'),
                    'loading': await img.get_attribute('loading'),
                    'class': await img.get_attribute('class')
                })
        
        return {
            'total_images': len(images),
            'images': images,
            'images_without_alt': len([img for img in images if not img['alt']])
        }
    
    async def _extract_scripts(self, page: Page) -> List[Dict[str, Any]]:
        """Extract script information"""
        script_elements = await page.locator('script').all()
        
        scripts = []
        for script in script_elements:
            src = await script.get_attribute('src')
            script_type = await script.get_attribute('type')
            async_attr = await script.get_attribute('async')
            defer_attr = await script.get_attribute('defer')
            
            script_data = {
                'src': src,
                'type': script_type or 'text/javascript',
                'async': async_attr is not None,
                'defer': defer_attr is not None,
                'inline': src is None
            }
            
            if not src:  # Inline script
                content = await script.inner_text()
                script_data['content_length'] = len(content)
                script_data['content_preview'] = content[:200] + '...' if len(content) > 200 else content
            
            scripts.append(script_data)
        
        return scripts
    
    async def _extract_styles(self, page: Page) -> List[Dict[str, Any]]:
        """Extract stylesheet information"""
        
        # External stylesheets
        link_elements = await page.locator('link[rel="stylesheet"]').all()
        external_styles = []
        for link in link_elements:
            external_styles.append({
                'href': await link.get_attribute('href'),
                'media': await link.get_attribute('media'),
                'type': await link.get_attribute('type')
            })
        
        # Inline styles
        style_elements = await page.locator('style').all()
        inline_styles = []
        for style in style_elements:
            content = await style.inner_text()
            inline_styles.append({
                'content_length': len(content),
                'content_preview': content[:200] + '...' if len(content) > 200 else content
            })
        
        return {
            'external_stylesheets': external_styles,
            'inline_styles': inline_styles
        }
    
    async def _extract_performance(self, page: Page) -> Dict[str, Any]:
        """Extract performance metrics"""
        
        performance_data = await page.evaluate('''
            () => {
                const navigation = performance.getEntriesByType('navigation')[0];
                const paint = performance.getEntriesByType('paint');
                
                return {
                    navigation: navigation ? {
                        domContentLoaded: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
                        loadComplete: navigation.loadEventEnd - navigation.loadEventStart,
                        domInteractive: navigation.domInteractive - navigation.fetchStart,
                        domComplete: navigation.domComplete - navigation.fetchStart
                    } : null,
                    paint: paint.reduce((acc, entry) => {
                        acc[entry.name] = entry.startTime;
                        return acc;
                    }, {}),
                    resources: performance.getEntriesByType('resource').length
                };
            }
        ''')
        
        return performance_data
    
    async def _extract_accessibility(self, page: Page) -> Dict[str, Any]:
        """Extract accessibility information"""
        
        accessibility = await page.evaluate('''
            () => {
                // Check for common accessibility attributes
                const imgs_without_alt = document.querySelectorAll('img:not([alt])').length;
                const buttons_without_text = Array.from(document.querySelectorAll('button')).filter(
                    btn => !btn.textContent.trim() && !btn.getAttribute('aria-label')
                ).length;
                const links_without_text = Array.from(document.querySelectorAll('a')).filter(
                    link => !link.textContent.trim() && !link.getAttribute('aria-label')
                ).length;
                const inputs_without_labels = Array.from(document.querySelectorAll('input')).filter(
                    input => {
                        const id = input.id;
                        const hasLabel = id && document.querySelector(`label[for="${id}"]`);
                        const hasAriaLabel = input.getAttribute('aria-label');
                        return !hasLabel && !hasAriaLabel;
                    }
                ).length;
                
                return {
                    images_without_alt: imgs_without_alt,
                    buttons_without_text: buttons_without_text,
                    links_without_text: links_without_text,
                    inputs_without_labels: inputs_without_labels,
                    has_lang_attribute: !!document.documentElement.lang,
                    has_skip_links: !!document.querySelector('a[href^="#"]'),
                    headings_structure: Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).map(h => h.tagName)
                };
            }
        ''')
        
        return accessibility
    
    async def _extract_security_info(self, page: Page) -> Dict[str, Any]:
        """Extract security-related information"""
        
        security = await page.evaluate('''
            () => {
                return {
                    protocol: location.protocol,
                    has_csp: !!document.querySelector('meta[http-equiv="Content-Security-Policy"]'),
                    has_xframe_options: !!document.querySelector('meta[http-equiv="X-Frame-Options"]'),
                    mixed_content: Array.from(document.querySelectorAll('img, script, link')).some(el => {
                        const src = el.src || el.href;
                        return src && src.startsWith('http:') && location.protocol === 'https:';
                    })
                };
            }
        ''')
        
        return security
    
    async def _detect_technologies(self, page: Page) -> Dict[str, Any]:
        """Detect technologies used on the website"""
        
        technologies = await page.evaluate('''
            () => {
                const tech = {
                    frameworks: [],
                    libraries: [],
                    analytics: [],
                    cms: [],
                    other: []
                };
                
                // Check for common frameworks and libraries
                if (window.React) tech.frameworks.push('React');
                if (window.Vue) tech.frameworks.push('Vue.js');
                if (window.angular) tech.frameworks.push('Angular');
                if (window.jQuery) tech.libraries.push('jQuery');
                if (window.bootstrap) tech.libraries.push('Bootstrap');
                if (window.ga || window.gtag) tech.analytics.push('Google Analytics');
                if (window.fbq) tech.analytics.push('Facebook Pixel');
                if (document.querySelector('script[src*="wordpress"]')) tech.cms.push('WordPress');
                if (document.querySelector('meta[name="generator"][content*="Drupal"]')) tech.cms.push('Drupal');
                
                return tech;
            }
        ''')
        
        return technologies
    
    async def _extract_tables(self, page: Page) -> List[Dict[str, Any]]:
        """Extract table data"""
        table_elements = await page.locator('table').all()
        
        tables = []
        for table in table_elements:
            # Get headers
            header_elements = await table.locator('th').all()
            headers = []
            for header in header_elements:
                text = await header.inner_text()
                headers.append(text.strip())
            
            # Get rows
            row_elements = await table.locator('tr').all()
            rows = []
            for row in row_elements:
                cell_elements = await row.locator('td').all()
                if cell_elements:  # Only data rows, not header rows
                    cells = []
                    for cell in cell_elements:
                        text = await cell.inner_text()
                        cells.append(text.strip())
                    rows.append(cells)
            
            if headers or rows:
                tables.append({
                    'headers': headers,
                    'rows': rows,
                    'id': await table.get_attribute('id'),
                    'class': await table.get_attribute('class')
                })
        
        return tables
    
    async def _find_main_content(self, page: Page) -> Optional[str]:
        """Find main content area"""
        selectors = ['main', '[role="main"]', '#main', '.main', '#content', '.content']
        
        for selector in selectors:
            try:
                element = page.locator(selector).first
                if await element.count() > 0:
                    text = await element.inner_text()
                    return text[:500] + '...' if len(text) > 500 else text
            except:
                continue
        
        return None
    
    async def _find_sidebar(self, page: Page) -> Optional[str]:
        """Find sidebar content"""
        selectors = ['aside', '[role="complementary"]', '#sidebar', '.sidebar']
        
        for selector in selectors:
            try:
                element = page.locator(selector).first
                if await element.count() > 0:
                    text = await element.inner_text()
                    return text[:300] + '...' if len(text) > 300 else text
            except:
                continue
        
        return None
    
    async def _find_footer(self, page: Page) -> Optional[str]:
        """Find footer content"""
        selectors = ['footer', '[role="contentinfo"]', '#footer', '.footer']
        
        for selector in selectors:
            try:
                element = page.locator(selector).first
                if await element.count() > 0:
                    text = await element.inner_text()
                    return text[:300] + '...' if len(text) > 300 else text
            except:
                continue
        
        return None
    
    async def _capture_screenshots(self, page: Page) -> Dict[str, str]:
        """Capture screenshots for visual analysis"""
        screenshots = {}
        
        try:
            # Full page screenshot
            full_page_path = f"screenshot_full_{int(time.time())}.png"
            await page.screenshot(path=full_page_path, full_page=True)
            screenshots['full_page'] = full_page_path
            
            # Viewport screenshot
            viewport_path = f"screenshot_viewport_{int(time.time())}.png"
            await page.screenshot(path=viewport_path)
            screenshots['viewport'] = viewport_path
            
        except Exception as e:
            screenshots['error'] = str(e)
        
        return screenshots
    
    async def _get_response_size(self, response: Response) -> Optional[int]:
        """Get response size if available"""
        try:
            body = await response.body()
            return len(body)
        except:
            return None


async def main():
    """Main function to run the analyzer"""
    
    if len(sys.argv) != 2:
        print("Usage: python website_analysis.py <url>")
        print("Example: python website_analysis.py https://example.com")
        sys.exit(1)
    
    url = sys.argv[1]
    
    # Ensure URL has protocol
    if not url.startswith(('http://', 'https://')):
        url = 'https://' + url
    
    print(f"Analyzing website: {url}")
    print("This may take a few moments...")
    
    analyzer = WebsiteAnalyzer(headless=True)
    
    try:
        analysis = await analyzer.analyze_website(url)
        
        # Save analysis to JSON file
        output_file = f"website_analysis_{int(time.time())}.json"
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(analysis, f, indent=2, ensure_ascii=False)
        
        print(f"\nAnalysis complete! Results saved to: {output_file}")
        
        # Print summary
        if 'error' not in analysis:
            print(f"\n=== WEBSITE ANALYSIS SUMMARY ===")
            print(f"Title: {analysis['basic_info']['title']}")
            print(f"URL: {analysis['basic_info']['url']}")
            print(f"Language: {analysis['basic_info']['language']}")
            print(f"Word Count: {analysis['content']['word_count']}")
            print(f"Total Elements: {analysis['structure']['element_counts']['total_elements']}")
            print(f"Total Links: {analysis['links']['total_links']}")
            print(f"Total Images: {analysis['images']['total_images']}")
            print(f"Forms Found: {len(analysis['forms'])}")
            print(f"Network Requests: {len(analysis['network']['requests'])}")
            
            if analysis['seo']['description']:
                print(f"Meta Description: {analysis['seo']['description'][:100]}...")
            
            # AI-friendly summary
            print(f"\n=== AI AGENT SUMMARY ===")
            print("Key Information for AI Processing:")
            print(f"- Content Type: {'Dynamic' if analysis['structure']['element_counts']['tags'].get('script', 0) > 5 else 'Static'}")
            print(f"- Main Purpose: {analysis['seo'].get('description', 'No description available')}")
            print(f"- Key Sections: {', '.join([h['text'] for h in analysis['content']['headings'][:5]])}")
            print(f"- Accessibility Score: {'Good' if analysis['accessibility']['images_without_alt'] < 3 else 'Needs Improvement'}")
            print(f"- Security: {'HTTPS' if analysis['security']['protocol'] == 'https:' else 'HTTP'}")
            
        else:
            print(f"Error analyzing website: {analysis['error']}")
    
    except KeyboardInterrupt:
        print("\nAnalysis interrupted by user")
    except Exception as e:
        print(f"Error: {str(e)}")


if __name__ == "__main__":
    asyncio.run(main())