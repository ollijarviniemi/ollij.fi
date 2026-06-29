import matplotlib.pyplot as plt
import matplotlib.patches as patches
from matplotlib import font_manager
from matplotlib.backends.backend_pdf import PdfPages
import numpy as np

def create_grid_image():
    """
    Creates two 1x5 vertical grids side by side with a large gap.
    Left grid: text rotated 90 degrees clockwise
    Right grid: text rotated 90 degrees counterclockwise
    Designed to be suitable for A4 PDF conversion.
    """
    
    # Set up the figure with sqrt(2):1 aspect ratio (width:height)
    fig_height = 12  # inches
    fig_width = fig_height * (2**0.5)  # sqrt(2):1 aspect ratio
    
    fig, ax = plt.subplots(1, 1, figsize=(fig_width, fig_height))
    
    # Grid parameters
    num_cells = 5
    cell_width = 1.5
    cell_height = 2.0
    gap_between_grids = 3.0  # Large gap between the two grids
    
    # Text values for each cell with longer separator
    text_values_right = ["10 ∕ 0", "9 ∕ 4", "7 ∕ 7", "4 ∕ 9", "0 ∕ 10"]
    text_values_left = ["0 ∕ 10", "4 ∕ 9", "7 ∕ 7", "9 ∕ 4", "10 ∕ 0"]  # Reversed order
    percentage_labels = ["0% — 20%", "20% — 40%", "40% — 60%", "60% — 80%", "80% — 100%"]
    
    # Colors
    border_color = 'black'
    text_color = 'black'
    
    # Create the first vertical grid (left side, clockwise rotation)
    for i in range(num_cells):
        x_pos = 0
        y_pos = i * cell_height
        
        # Create rectangle for each cell
        rect = patches.Rectangle(
            (x_pos, y_pos), 
            cell_width, 
            cell_height,
            linewidth=2,
            edgecolor=border_color,
            facecolor='white'
        )
        ax.add_patch(rect)
        
        # Add text to each cell, rotated 90 degrees clockwise
        text_x = x_pos + cell_width / 2
        text_y = y_pos + cell_height / 2
        
        ax.text(
            text_x, 
            text_y, 
            text_values_left[i],
            ha='center',
            va='center',
            fontsize=28,
            fontweight='bold',
            color=text_color,
            rotation=-90  # 90 degrees clockwise
        )
    
    # Create the second vertical grid (right side, counterclockwise rotation)
    second_grid_x_offset = cell_width + gap_between_grids
    
    for i in range(num_cells):
        x_pos = second_grid_x_offset
        y_pos = i * cell_height
        
        # Create rectangle for each cell
        rect = patches.Rectangle(
            (x_pos, y_pos), 
            cell_width, 
            cell_height,
            linewidth=2,
            edgecolor=border_color,
            facecolor='white'
        )
        ax.add_patch(rect)
        
        # Add text to each cell, rotated 90 degrees counterclockwise
        text_x = x_pos + cell_width / 2
        text_y = y_pos + cell_height / 2
        
        ax.text(
            text_x, 
            text_y, 
            text_values_right[i],
            ha='center',
            va='center',
            fontsize=28,
            fontweight='bold',
            color=text_color,
            rotation=90  # 90 degrees counterclockwise
        )
    
    # Add percentage labels in the middle between the columns
    middle_x = cell_width + gap_between_grids / 2
    
    for i in range(num_cells):
        middle_y = i * cell_height + cell_height / 2
        
        ax.text(
            middle_x,
            middle_y,
            percentage_labels[i],
            ha='center',
            va='center',
            fontsize=22,
            fontweight='bold',
            color=text_color
        )
    
    # Calculate total width for positioning
    total_width = second_grid_x_offset + cell_width
    
    # Add title text at the top
    title_y = num_cells * cell_height + 0.8
    title_x = total_width / 2
    ax.text(
        title_x,
        title_y,
        "Satisfied",
        ha='center',
        va='center',
        fontsize=32,
        fontweight='bold',
        color=text_color
    )
    
    # Add bottom text
    bottom_y = -0.8
    bottom_x = total_width / 2
    ax.text(
        bottom_x,
        bottom_y,
        "Not satisfied",
        ha='center',
        va='center',
        fontsize=32,
        fontweight='bold',
        color=text_color
    )
    
    # Set axis properties to include both grids and text
    ax.set_xlim(-0.2, total_width + 0.2)
    ax.set_ylim(-1.2, num_cells * cell_height + 1.2)  # Extended for text
    ax.set_aspect('equal')
    
    # Remove axis ticks and labels
    ax.set_xticks([])
    ax.set_yticks([])
    
    # Remove the frame around the plot
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    ax.spines['bottom'].set_visible(False)
    ax.spines['left'].set_visible(False)
    
    # Adjust layout to prevent clipping
    plt.tight_layout()
    
    return fig

def save_grid_image(filename="double_grid_1x5.png", dpi=300):
    """
    Creates and saves the grid image with high quality for PDF conversion.
    
    Args:
        filename (str): Output filename
        dpi (int): Resolution for the saved image
    """
    fig = create_grid_image()
    
    # Save with high DPI for good quality in PDF
    plt.savefig(
        filename,
        dpi=dpi,
        bbox_inches='tight',
        facecolor='white',
        edgecolor='none'
    )
    
    print(f"Grid image saved as {filename}")
    return filename

def create_a4_grid_image():
    """
    Creates the grid with proper A4 sizing and controlled margins.
    A4 dimensions: 8.27 × 11.69 inches (210 × 297 mm)
    """
    # Fixed A4 dimensions in inches
    A4_WIDTH = 8.27
    A4_HEIGHT = 11.69
    
    # Create figure with exact A4 dimensions
    fig, ax = plt.subplots(1, 1, figsize=(A4_WIDTH, A4_HEIGHT))
    
    # Grid parameters - fixed sizes for better appearance
    num_cells = 5
    cell_width = 2.3  # Fixed cell width for good proportions
    cell_height = 2  # Fixed cell height for good proportions
    gap_between_grids = 3  # Fixed gap for readability
    
    # Calculate total content dimensions
    total_grid_width = 2 * cell_width + gap_between_grids
    total_grid_height = num_cells * cell_height
    
    # Reserve space for title texts
    title_space = 0.7
    total_content_height = total_grid_height + 2 * title_space
    
    # Center the content on the A4 page
    start_x = (A4_WIDTH - total_grid_width) / 2
    start_y = (A4_HEIGHT - total_content_height) / 2 + title_space
    
    # Text values for each cell with longer separator
    text_values_right = ["10 ∕ 0", "9 ∕ 4", "7 ∕ 7", "4 ∕ 9", "0 ∕ 10"]
    text_values_left = ["0 ∕ 10", "4 ∕ 9", "7 ∕ 7", "9 ∕ 4", "10 ∕ 0"]  # Reversed order
    percentage_labels = ["0% — 20%", "20% — 40%", "40% — 60%", "60% — 80%", "80% — 100%"]
    
    # Colors
    border_color = 'black'
    text_color = 'black'
    
    # Create the first vertical grid (left side, clockwise rotation)
    for i in range(num_cells):
        x_pos = start_x
        y_pos = start_y + i * cell_height
        
        # Create rectangle for each cell
        rect = patches.Rectangle(
            (x_pos, y_pos), 
            cell_width, 
            cell_height,
            linewidth=2,
            edgecolor=border_color,
            facecolor='white'
        )
        ax.add_patch(rect)
        
        # Add text to each cell, rotated 90 degrees clockwise
        text_x = x_pos + cell_width / 2
        text_y = y_pos + cell_height / 2
        
        ax.text(
            text_x, 
            text_y, 
            text_values_left[i],
            ha='center',
            va='center',
            fontsize=int(cell_height * 12),  # Scale font with cell size
            fontweight='bold',
            color=text_color,
            rotation=-90  # 90 degrees clockwise
        )
    
    # Create the second vertical grid (right side, counterclockwise rotation)
    second_grid_x_offset = start_x + cell_width + gap_between_grids
    
    for i in range(num_cells):
        x_pos = second_grid_x_offset
        y_pos = start_y + i * cell_height
        
        # Create rectangle for each cell
        rect = patches.Rectangle(
            (x_pos, y_pos), 
            cell_width, 
            cell_height,
            linewidth=2,
            edgecolor=border_color,
            facecolor='white'
        )
        ax.add_patch(rect)
        
        # Add text to each cell, rotated 90 degrees counterclockwise
        text_x = x_pos + cell_width / 2
        text_y = y_pos + cell_height / 2
        
        ax.text(
            text_x, 
            text_y, 
            text_values_right[i],
            ha='center',
            va='center',
            fontsize=int(cell_height * 12),  # Scale font with cell size
            fontweight='bold',
            color=text_color,
            rotation=90  # 90 degrees counterclockwise
        )
    
    # Add percentage labels in the middle between the columns
    middle_x = start_x + cell_width + gap_between_grids / 2
    
    for i in range(num_cells):
        middle_y = start_y + i * cell_height + cell_height / 2
        
        ax.text(
            middle_x,
            middle_y,
            percentage_labels[i],
            ha='center',
            va='center',
            fontsize=int(cell_height * 9),  # Scale font with cell size
            fontweight='bold',
            color=text_color
        )
    
    # Calculate total grid dimensions for centering titles
    total_grid_width = 2 * cell_width + gap_between_grids
    total_grid_height = num_cells * cell_height
    
    # Add title text at the top
    title_y = start_y + total_grid_height + title_space * 0.5
    title_x = start_x + total_grid_width / 2
    ax.text(
        title_x,
        title_y,
        "Satisfied",
        ha='center',
        va='center',
        fontsize=int(cell_height * 14),  # Scale font with cell size
        fontweight='bold',
        color=text_color
    )
    
    # Add bottom text
    bottom_y = start_y - title_space * 0.5
    bottom_x = start_x + total_grid_width / 2
    ax.text(
        bottom_x,
        bottom_y,
        "Not satisfied",
        ha='center',
        va='center',
        fontsize=int(cell_height * 14),  # Scale font with cell size
        fontweight='bold',
        color=text_color
    )
    
    # Set axis limits to full A4 dimensions to maintain A4 aspect ratio
    ax.set_xlim(0, A4_WIDTH)
    ax.set_ylim(0, A4_HEIGHT)
    ax.set_aspect('equal')
    
    # Remove axis ticks and labels
    ax.set_xticks([])
    ax.set_yticks([])
    
    # Remove the frame around the plot
    ax.spines['top'].set_visible(False)
    ax.spines['right'].set_visible(False)
    ax.spines['bottom'].set_visible(False)
    ax.spines['left'].set_visible(False)
    
    return fig

def save_grid_pdf(filename="double_grid_1x5.pdf"):
    """
    Creates and saves the grid as an A4-sized PDF file with minimal margins.
    
    Args:
        filename (str): Output PDF filename
    """
    fig = create_a4_grid_image()
    
    # Save as A4 PDF with tight bounding box to eliminate margins
    with PdfPages(filename) as pdf:
        pdf.savefig(
            fig,
            facecolor='white',
            edgecolor='none',
            bbox_inches='tight',  # Crop to content bounds
            pad_inches=0.05       # Minimal padding
        )
    
    plt.close(fig)
    print(f"A4 Grid PDF saved as {filename}")
    return filename

def show_grid_image():
    """
    Creates and displays the grid image.
    """
    fig = create_grid_image()
    plt.show()

if __name__ == "__main__":
    # Create and save the image
    save_grid_image("double_grid_1x5.png")
    
    # Create and save as PDF
    save_grid_pdf("double_grid_1x5.pdf")
    
    # Optionally display the image
    # show_grid_image()
