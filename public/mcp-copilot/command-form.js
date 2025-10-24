// Dynamic Command Form Generator
// Creates and manages forms for command execution

class CommandFormManager {
  constructor() {
    this.currentForm = null;
    this.createModal();
  }

  createModal() {
    // Create modal backdrop
    const modalHTML = `
      <div id="commandModal" class="command-modal">
        <div class="command-modal-content">
          <div class="command-modal-header">
            <h3 id="modalTitle"></h3>
            <button class="modal-close" onclick="commandFormManager.closeForm()">&times;</button>
          </div>
          <div class="command-modal-body">
            <p id="modalDescription" class="modal-description"></p>
            <form id="commandForm">
              <div id="formFields"></div>
              <div class="form-actions">
                <button type="button" class="btn-cancel" onclick="commandFormManager.closeForm()">Cancel</button>
                <button type="submit" class="btn-submit" id="submitBtn">Execute</button>
              </div>
            </form>
          </div>
        </div>
      </div>
    `;

    // Add to document
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Add event listener for form submission
    document.getElementById('commandForm').addEventListener('submit', (e) => {
      e.preventDefault();
      this.handleSubmit();
    });

    // Close modal when clicking outside
    document.getElementById('commandModal').addEventListener('click', (e) => {
      if (e.target.id === 'commandModal') {
        this.closeForm();
      }
    });
  }

  openForm(command) {
    this.currentForm = command;

    // Set title and description
    document.getElementById('modalTitle').innerHTML = `${command.icon} ${command.label}`;
    document.getElementById('modalDescription').textContent = command.description;

    // Build form fields
    const fieldsContainer = document.getElementById('formFields');
    fieldsContainer.innerHTML = '';

    if (command.fields.length === 0) {
      // No fields needed, just show confirmation
      fieldsContainer.innerHTML = '<p class="no-fields">This command requires no input. Click Execute to run it.</p>';
    } else {
      command.fields.forEach(field => {
        const fieldHTML = this.createField(field);
        fieldsContainer.insertAdjacentHTML('beforeend', fieldHTML);
      });
    }

    // Update submit button text
    document.getElementById('submitBtn').textContent = command.label;

    // Show modal
    document.getElementById('commandModal').classList.add('active');

    // Focus first input
    setTimeout(() => {
      const firstInput = fieldsContainer.querySelector('input, textarea, select');
      if (firstInput) firstInput.focus();
    }, 100);
  }

  createField(field) {
    const required = field.required ? 'required' : '';
    const requiredLabel = field.required ? '<span class="required">*</span>' : '';

    let inputHTML = '';

    switch (field.type) {
      case 'textarea':
        inputHTML = `<textarea id="${field.name}" name="${field.name}" ${required} placeholder="${field.placeholder || ''}" rows="4"></textarea>`;
        break;

      case 'select':
        const options = field.options.map(opt => `<option value="${opt}">${opt}</option>`).join('');
        inputHTML = `<select id="${field.name}" name="${field.name}" ${required}>
          <option value="">Select ${field.label}</option>
          ${options}
        </select>`;
        break;

      default:
        inputHTML = `<input type="${field.type}" id="${field.name}" name="${field.name}" ${required} placeholder="${field.placeholder || ''}" />`;
    }

    return `
      <div class="form-group">
        <label for="${field.name}">${field.label} ${requiredLabel}</label>
        ${inputHTML}
      </div>
    `;
  }

  closeForm() {
    document.getElementById('commandModal').classList.remove('active');
    this.currentForm = null;
  }

  handleSubmit() {
    const form = document.getElementById('commandForm');
    const formData = new FormData(form);
    const data = {};

    // Collect form data
    for (let [key, value] of formData.entries()) {
      data[key] = value.trim();
    }

    // Build command string
    const commandString = this.currentForm.buildCommand(data);

    console.log('📤 Executing command:', commandString);

    // Show confirmation if needed
    if (this.currentForm.confirmMessage) {
      if (!confirm(this.currentForm.confirmMessage)) {
        return;
      }
    }

    // Close form
    this.closeForm();

    // Execute command by setting it in the input and triggering send
    document.getElementById('messageInput').value = commandString;
    sendMessage();
  }

  // Render category buttons in sidebar
  renderCategories(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    let html = '';

    for (const [key, category] of Object.entries(COMMAND_TEMPLATES)) {
      const categoryId = `category-${key}`;
      html += `
        <div class="command-category collapsed" id="${categoryId}">
          <h4 onclick="commandFormManager.toggleCategory('${categoryId}')">${category.icon} ${category.category}</h4>
          <div class="command-buttons">
            ${category.commands.map(cmd => `
              <button class="command-btn" onclick="commandFormManager.openForm(COMMAND_TEMPLATES.${key}.commands.find(c => c.id === '${cmd.id}'))">
                ${cmd.icon} ${cmd.label}
              </button>
            `).join('')}
          </div>
        </div>
      `;
    }

    container.innerHTML = html;
  }

  // Toggle category collapse
  toggleCategory(categoryId) {
    const category = document.getElementById(categoryId);
    if (category) {
      category.classList.toggle('collapsed');
    }
  }
}

// Initialize global instance
let commandFormManager;
document.addEventListener('DOMContentLoaded', () => {
  commandFormManager = new CommandFormManager();
});
