#!/usr/bin/env python3
"""
Script to merge the game board PDF with the belief conditions cards PDF.
The game board should be on the first page, followed by all the cards.
Both PDFs need to be normalized to the same page size (A4).
"""

import sys
from PyPDF2 import PdfReader, PdfWriter
from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import A4
from reportlab.lib.utils import ImageReader
import io
import fitz  # PyMuPDF for better PDF handling

def normalize_pdf_to_a4(input_path, output_path):
    """
    Convert a PDF to A4 size, centering the content if it's smaller.
    """
    # Open the PDF with PyMuPDF
    doc = fitz.open(input_path)
    
    # Create a new PDF writer
    writer = PdfWriter()
    
    # High DPI for better resolution (300 DPI is print quality)
    dpi = 300
    
    for page_num in range(len(doc)):
        page = doc[page_num]
        
        # Get the page dimensions
        rect = page.rect
        page_width = rect.width
        page_height = rect.height
        
        # A4 dimensions in points
        a4_width, a4_height = A4
        
        # Create a new A4 page
        packet = io.BytesIO()
        can = canvas.Canvas(packet, pagesize=A4)
        
        # Calculate scaling and positioning to center the content
        scale_x = a4_width / page_width
        scale_y = a4_height / page_height
        scale = min(scale_x, scale_y, 1.0)  # Don't scale up, only down if needed
        
        # Calculate position to center the scaled content
        scaled_width = page_width * scale
        scaled_height = page_height * scale
        x_offset = (a4_width - scaled_width) / 2
        y_offset = (a4_height - scaled_height) / 2
        
        # Create high-resolution transformation matrix
        # The zoom factor is calculated to achieve the desired DPI
        zoom = dpi / 72.0  # 72 DPI is the default PDF resolution
        mat = fitz.Matrix(scale * zoom, scale * zoom)
        
        # Render the page as a high-resolution image
        pix = page.get_pixmap(matrix=mat)
        img_data = pix.tobytes("png")
        img = ImageReader(io.BytesIO(img_data))
        
        can.drawImage(img, x_offset, y_offset, width=scaled_width, height=scaled_height)
        can.save()
        
        # Move to the beginning of the StringIO buffer
        packet.seek(0)
        new_pdf = PdfReader(packet)
        writer.add_page(new_pdf.pages[0])
    
    doc.close()
    
    # Write the normalized PDF
    with open(output_path, 'wb') as output_file:
        writer.write(output_file)

def normalize_game_board_to_fill_a4(input_path, output_path):
    """
    Convert the game board PDF to A4 size, scaling it to fill the entire page.
    """
    # Open the PDF with PyMuPDF
    doc = fitz.open(input_path)
    page = doc[0]  # Game board should be single page
    
    # Get the page dimensions
    rect = page.rect
    page_width = rect.width
    page_height = rect.height
    
    # A4 dimensions in points
    a4_width, a4_height = A4
    
    # Create a new A4 page
    packet = io.BytesIO()
    can = canvas.Canvas(packet, pagesize=A4)
    
    # High DPI for better resolution (300 DPI is print quality)
    dpi = 300
    
    # Scale to fill the entire A4 page
    scale_x = a4_width / page_width
    scale_y = a4_height / page_height
    scale = max(scale_x, scale_y)  # Use max to fill the page completely
    
    # Calculate position to center the scaled content
    scaled_width = page_width * scale
    scaled_height = page_height * scale
    x_offset = (a4_width - scaled_width) / 2
    y_offset = (a4_height - scaled_height) / 2
    
    # Create high-resolution transformation matrix
    # The zoom factor is calculated to achieve the desired DPI
    zoom = dpi / 72.0  # 72 DPI is the default PDF resolution
    mat = fitz.Matrix(scale * zoom, scale * zoom)
    
    # Render the page as a high-resolution image
    pix = page.get_pixmap(matrix=mat)
    img_data = pix.tobytes("png")
    img = ImageReader(io.BytesIO(img_data))
    
    can.drawImage(img, x_offset, y_offset, width=scaled_width, height=scaled_height)
    can.save()
    
    # Move to the beginning of the StringIO buffer
    packet.seek(0)
    new_pdf = PdfReader(packet)
    
    # Create writer and add the page
    writer = PdfWriter()
    writer.add_page(new_pdf.pages[0])
    
    doc.close()
    
    # Write the normalized PDF
    with open(output_path, 'wb') as output_file:
        writer.write(output_file)

def merge_pdfs(game_board_path, cards_path, output_path):
    """
    Merge the game board PDF (first page) with the cards PDF (following pages).
    Both PDFs should already be normalized to A4.
    """
    writer = PdfWriter()
    
    # Add the game board (first page)
    game_board_reader = PdfReader(game_board_path)
    writer.add_page(game_board_reader.pages[0])
    
    # Add all the cards pages
    cards_reader = PdfReader(cards_path)
    for page in cards_reader.pages:
        writer.add_page(page)
    
    # Write the merged PDF
    with open(output_path, 'wb') as output_file:
        writer.write(output_file)

def main():
    # File paths
    game_board_original = "double_grid_1x5.pdf"
    cards_original = "belief_conditions_cards.pdf"
    game_board_normalized = "double_grid_1x5_a4.pdf"
    cards_normalized = "belief_conditions_cards_a4.pdf"
    final_output = "eriavatuskomukset_temp.pdf"
    
    print("Step 1: Normalizing game board PDF to A4 (filling entire page)...")
    normalize_game_board_to_fill_a4(game_board_original, game_board_normalized)
    
    print("Step 2: Normalizing cards PDF to A4...")
    normalize_pdf_to_a4(cards_original, cards_normalized)
    
    print("Step 3: Merging PDFs...")
    merge_pdfs(game_board_normalized, cards_normalized, final_output)
    
    print(f"Successfully created merged PDF: {final_output}")
    print("Game board is on page 1, cards follow on subsequent pages.")

    # Append the score sheet as the last page, if it has been generated.
    import os
    if os.path.exists("scoresheet.pdf"):
        print("Step 4: Appending score sheet...")
        w = PdfWriter()
        for p in PdfReader(final_output).pages:
            w.add_page(p)
        for p in PdfReader("scoresheet.pdf").pages:
            w.add_page(p)
        with open(final_output, "wb") as f:
            w.write(f)
        print("Score sheet appended as the final page.")

    # Clean up temporary files
    os.remove(game_board_normalized)
    os.remove(cards_normalized)
    
    print("Temporary files cleaned up.")

if __name__ == "__main__":
    main()
