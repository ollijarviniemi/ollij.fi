#!/usr/bin/env python3
"""
Export belief condition cards from HTML file to PDF
Based on the existing probability cards export system
"""

import asyncio
import os
from pyppeteer import launch

async def export_belief_cards_to_pdf():
    """
    Export belief_conditions_cards.html to PDF with proper formatting
    """
    # Get the absolute path to the HTML file
    html_file = os.path.abspath("belief_conditions_cards.html")
    output_pdf = os.path.abspath("belief_conditions_cards.pdf")
    
    print(f"Input HTML: {html_file}")
    print(f"Output PDF: {output_pdf}")
    
    # Launch browser
    browser = await launch(
        headless=True,
        args=['--no-sandbox', '--disable-setuid-sandbox']
    )
    
    try:
        page = await browser.newPage()
        
        # Load the HTML file
        await page.goto(f'file://{html_file}')
        
        # Wait for page to load completely
        await page.waitForSelector('.card-condition')
        
        # CSS for PDF optimization
        css_content = '''
            /* Hide everything first */
            body * {
                visibility: hidden;
            }
            
            /* Show only card-condition divs and their children */
            .card-condition,
            .card-condition * {
                visibility: visible;
            }
            
            /* Reset body styles for PDF */
            body {
                margin: 0;
                padding: 20px;
                background: white !important;
                font-family: Arial, sans-serif;
            }
            
            /* Optimize card layout for PDF */
            .card-condition {
                background: white;
                margin: 15px 0;
                padding: 15px;
                border: 1px solid #ddd;
                border-radius: 8px;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 10px;
                page-break-inside: avoid;
                max-width: 500px;
                width: 100%;
            }
            
            .condition-text {
                font-size: 16px;
                font-weight: bold;
                text-align: center;
                width: 100%;
                margin-bottom: 5px;
            }
            
            .svg-container {
                display: flex;
                justify-content: center;
                width: 100%;
                max-width: 450px;
            }
            
            /* Ensure SVGs scale properly */
            .svg-container svg {
                max-width: 100%;
                height: auto;
            }
            
            /* Hide the main title */
            h1 {
                display: none;
            }
        '''
        
        # Inject CSS
        await page.addStyleTag({'content': css_content})
        
        # Generate PDF with optimized settings
        await page.pdf({
            'path': output_pdf,
            'format': 'A4',
            'margin': {
                'top': '20px',
                'right': '20px',
                'bottom': '20px',
                'left': '20px'
            },
            'printBackground': True,
            'preferCSSPageSize': False
        })
        
        print(f"PDF exported successfully to: {output_pdf}")
        
    finally:
        await browser.close()

async def main():
    """Export belief condition cards to PDF"""
    
    print("=== Exporting Belief Condition Cards to PDF ===\n")
    
    await export_belief_cards_to_pdf()
    print()
    
    print("=== Export Complete ===")
    print("Generated file:")
    print("- belief_conditions_cards.pdf")

if __name__ == "__main__":
    asyncio.run(main())
