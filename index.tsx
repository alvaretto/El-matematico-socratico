/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { GoogleGenAI, Chat, Part } from '@google/genai';

declare const katex: any;

const MATE_TUTOR_PROMPT = `Eres "MateTutor", un tutor de matemáticas amigable y paciente. Un estudiante te va a mostrar una pregunta de la prueba ICFES en la que está atascado.

Tu objetivo NO es darle la respuesta. Tu objetivo es guiarlo para que la descubra por sí mismo. Sigue estos pasos rigurosamente:
1.  Saluda al estudiante amablemente y pídele que te explique qué ha intentado hasta ahora y dónde cree que está el problema. NO resuelvas ni expliques el problema en tu primer mensaje. Solo pregunta.
2.  Basado en su respuesta, hazle preguntas socráticas para que identifique los datos clave del problema. (Ej: "¿Qué información te da el gráfico?", "¿Qué significa 'promedio'?", "¿Qué fórmula crees que podría ser útil aquí?").
3.  Si está completamente perdido, dale una pequeña pista o un ejemplo más sencillo del mismo concepto. No le des la respuesta directamente.
4.  ¡Sé siempre positivo y anímalo a seguir intentando! Usa emojis para hacer la conversación más amigable. 😃👍🎉`;

// --- DOM Elements ---
const chatContainer = document.getElementById('chat-container')!;
const chatForm = document.getElementById('chat-form')!;
const promptInput = document.getElementById('prompt-input') as HTMLTextAreaElement;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const imagePreviewContainer = document.getElementById('image-preview-container')!;
const themeToggleButton = document.getElementById('theme-toggle')!;


let attachedFile: File | null = null;

// --- Gemini AI Setup ---
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
const chat: Chat = ai.chats.create({
  model: 'gemini-2.5-flash',
  config: {
    systemInstruction: MATE_TUTOR_PROMPT,
  },
});

// --- Helper Functions ---
async function fileToGenerativePart(file: File): Promise<Part> {
  const base64EncodedDataPromise = new Promise<string>((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
    reader.readAsDataURL(file);
  });
  return {
    inlineData: { data: await base64EncodedDataPromise, mimeType: file.type },
  };
}

/**
 * Finds and renders LaTeX expressions in a string of text.
 * @param element The HTML element to render the text into.
 * @param text The text content, which may contain LaTeX.
 */
function renderLatexInElement(element: HTMLElement, text: string) {
    // Replace display math expressions ($$ ... $$) with rendered HTML from KaTeX.
    // Using .innerHTML is necessary to display the formatted math.
    // KaTeX's output is sanitized, so this is generally safe.
    const processedText = text.replace(/\$\$([\s\S]*?)\$\$/g, (match, latex) => {
        try {
            // KaTeX will throw an error for invalid LaTeX.
            // We catch it and return the original text to avoid breaking the app.
            return katex.renderToString(latex.trim(), {
                displayMode: true,
                throwOnError: false // Prevents KaTeX from throwing on parse errors.
            });
        } catch (e) {
            console.error('Error rendering LaTeX:', e);
            return match; // Return the original '$$...$$' block on error.
        }
    });

    element.innerHTML = processedText;
}


function appendMessage(role: 'user' | 'model' | 'loading', content?: string | HTMLElement) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', `${role}-message`);

    if (content) {
        if (typeof content === 'string') {
            const contentWrapper = document.createElement('div');
            contentWrapper.textContent = content;
            messageDiv.appendChild(contentWrapper);
        } else {
            messageDiv.appendChild(content);
        }
    }
    
    chatContainer.appendChild(messageDiv);
    chatContainer.scrollTop = chatContainer.scrollHeight;
    return messageDiv;
}

function showLoadingIndicator() {
    const loadingDiv = document.createElement('div');
    loadingDiv.classList.add('loading-dots');
    loadingDiv.innerHTML = '<div></div><div></div><div></div>';
    const loadingMessage = appendMessage('loading');
    loadingMessage.classList.add('model-message'); // Style it like a model message
    loadingMessage.appendChild(loadingDiv);
    return loadingMessage;
}

function updateImagePreview() {
    imagePreviewContainer.innerHTML = '';
    if (attachedFile) {
        const previewWrapper = document.createElement('div');
        previewWrapper.className = 'image-preview';
        
        const img = document.createElement('img');
        img.src = URL.createObjectURL(attachedFile);
        img.alt = 'Image preview';
        
        const removeBtn = document.createElement('button');
        removeBtn.textContent = '×';
        removeBtn.onclick = () => {
            attachedFile = null;
            fileInput.value = ''; // Reset file input
            updateImagePreview();
        };
        
        previewWrapper.appendChild(img);
        previewWrapper.appendChild(removeBtn);
        imagePreviewContainer.appendChild(previewWrapper);
        imagePreviewContainer.style.display = 'block';
    } else {
        imagePreviewContainer.style.display = 'none';
    }
}

// --- Event Listeners ---
chatForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const userText = promptInput.value.trim();

    if (!userText && !attachedFile) {
        return;
    }

    // Display user message
    const userMessageDiv = appendMessage('user');
    const textWrapper = document.createElement('div');
    if (userText) {
        textWrapper.textContent = userText;
        userMessageDiv.appendChild(textWrapper);
    }
    if (attachedFile) {
        const img = document.createElement('img');
        img.src = URL.createObjectURL(attachedFile);
        img.alt = 'User upload';
        img.classList.add('message-image');
        userMessageDiv.appendChild(img);
    }

    const loadingIndicator = showLoadingIndicator();

    // Prepare parts for Gemini
    const messageParts: Part[] = [];
    if (userText) {
        messageParts.push({ text: userText });
    }
    if (attachedFile) {
        messageParts.push(await fileToGenerativePart(attachedFile));
    }
    
    // Clean up input fields
    promptInput.value = '';
    promptInput.style.height = 'auto';
    attachedFile = null;
    fileInput.value = '';
    updateImagePreview();

    // Send message to Gemini and stream response
    try {
        const result = await chat.sendMessageStream({ message: messageParts });
        let fullResponse = '';
        loadingIndicator.remove(); // Remove loading dots
        const modelMessageDiv = appendMessage('model', '');

        for await (const chunk of result) {
            fullResponse += chunk.text;
            renderLatexInElement(modelMessageDiv, fullResponse);
            chatContainer.scrollTop = chatContainer.scrollHeight;
        }
    } catch (error) {
        loadingIndicator.remove();
        appendMessage('model', 'Lo siento, algo salió mal. Por favor, intenta de nuevo.');
        console.error(error);
    }
});

promptInput.addEventListener('input', () => {
    promptInput.style.height = 'auto';
    promptInput.style.height = `${promptInput.scrollHeight}px`;
});

promptInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        chatForm.dispatchEvent(new Event('submit'));
    }
});

fileInput.addEventListener('change', () => {
    if (fileInput.files && fileInput.files.length > 0) {
        attachedFile = fileInput.files[0];
        updateImagePreview();
    }
});


// --- Theme Toggle ---
function applyTheme(theme: 'light' | 'dark') {
    if (theme === 'dark') {
        document.documentElement.classList.add('dark-theme');
    } else {
        document.documentElement.classList.remove('dark-theme');
    }
}

themeToggleButton.addEventListener('click', () => {
    const isDark = document.documentElement.classList.contains('dark-theme');
    const newTheme = isDark ? 'light' : 'dark';
    applyTheme(newTheme);
    localStorage.setItem('theme', newTheme);
});

// --- Initial Setup ---
function start() {
    // Apply saved theme or system preference
    const savedTheme = localStorage.getItem('theme');
    const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    if (savedTheme) {
        applyTheme(savedTheme as 'light' | 'dark');
    } else if (systemPrefersDark) {
        applyTheme('dark');
    } else {
        applyTheme('light');
    }
    
    // Initial message
    appendMessage('model', '¡Hola! Soy MateTutor 😃. Muéstrame esa pregunta de matemáticas en la que necesitas ayuda. ¡Puedes escribirla o subir una imagen y juntos la resolveremos paso a paso!');
}

start();
