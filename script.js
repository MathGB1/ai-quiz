// script.js

// Tenta importar a SDK do Gemini. Se falhar, pode ser um problema com o CDN ou o navegador.
// Usaremos esm.sh que é um CDN que serve pacotes npm como módulos ES.
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from 'https://esm.sh/@google/generative-ai';

document.addEventListener('DOMContentLoaded', () => {
    const setupArea = document.getElementById('setupArea');
    const quizArea = document.getElementById('quizArea');
    const resultArea = document.getElementById('resultArea');
    const loadingMessage = document.getElementById('loadingMessage');
    const errorMessage = document.getElementById('errorMessage');

    const generateQuizBtn = document.getElementById('generateQuizBtn');
    const apiKeyInput = document.getElementById('apiKey');
    const themeInput = document.getElementById('theme');
    const difficultySelect = document.getElementById('difficulty');
    const numQuestionsSelect = document.getElementById('numQuestions');
    const testQuizCheckbox = document.getElementById('testQuizCheckbox');

    const quizTitle = document.getElementById('quizTitle');
    const timerDisplaySpan = document.querySelector('#timerDisplay span');
    const questionNumberDisplay = document.getElementById('questionNumber');
    const questionTextDisplay = document.getElementById('questionText');
    const optionsContainer = document.getElementById('optionsContainer');
    const prevQuestionBtn = document.getElementById('prevQuestionBtn');
    const nextQuestionBtn = document.getElementById('nextQuestionBtn');
    const submitQuizBtn = document.getElementById('submitQuizBtn');
    const scoreDisplay = document.getElementById('scoreDisplay');
    const restartQuizBtn = document.getElementById('restartQuizBtn');

    let quizData = [];
    let currentQuestionIndex = 0;
    let userAnswers = [];
    let timerInterval;
    let timeLeft = 0;

    const simpleTestQuiz = [
        { question: "Quanto é 1 + 1?", options: ["1", "2", "3", "4"], correctAnswer: "2" },
        { question: "Quanto é 2 + 2?", options: ["2", "3", "4", "5"], correctAnswer: "4" },
        { question: "Quanto é 3 + 3?", options: ["4", "5", "6", "7"], correctAnswer: "6" },
        { question: "Quanto é 4 + 4?", options: ["6", "7", "8", "9"], correctAnswer: "8" }
    ];

    async function callGeminiAPI(apiKey, theme, difficulty, numQuestionsValue) {
        if (!apiKey) {
            throw new Error("Chave de API não fornecida.");
        }

        let genAI;
        let model;
        try {
            genAI = new GoogleGenerativeAI(apiKey);
            model = genAI.getGenerativeModel({
                model: "gemini-1.5-flash-latest", // ou gemini-pro
                systemInstruction: `Você é um assistente especializado em criar quizzes. Seu objetivo é gerar quizzes com base nos temas, níveis de dificuldade e número de questões fornecidos.
A resposta DEVE ser um array JSON válido. Cada objeto no array representa uma questão e precisa seguir esta estrutura:
{
  "question": "Texto da pergunta aqui",
  "options": ["Opção A", "Opção B", "Opção C", "Opção D"],
  "correctAnswer": "Texto exato da opção correta, que deve estar entre as 'options'."
}
Todo o conteúdo (perguntas, opções, respostas corretas) DEVE ser em Português do Brasil (PT-BR), com linguagem clara e natural.
Não inclua nenhum texto fora do array JSON principal (sem introduções, conclusões ou formatação markdown como \`\`\`json).
Apenas o array JSON. Verifique se todas as strings dentro do JSON estão corretamente formatadas.`,
            });
        } catch (initError) {
            console.error('Erro ao inicializar GoogleGenerativeAI:', initError);
            throw new Error('Chave de API inválida ou problema ao inicializar o modelo de IA.');
        }

        let difficultyDescription;
        switch (difficulty.toLowerCase()) {
            case 'easy': difficultyDescription = "de nível fácil, para iniciantes"; break;
            case 'medium': difficultyDescription = "de dificuldade média, que exige um pouco de atenção"; break;
            case 'hard': difficultyDescription = "desafiador, para quem já tem um bom conhecimento sobre o tema"; break;
            default: throw new Error('Nível de dificuldade inválido.');
        }

        const questionCount = parseInt(numQuestionsValue, 10);
        const userPrompt = `
            Crie um quiz sobre o tema "${theme}".
            O quiz deve ter exatamente ${questionCount} questões.
            As questões devem ser ${difficultyDescription}.
            Cada questão deve ter 4 opções de múltipla escolha.
            Indique a resposta correta para cada questão, seguindo a estrutura JSON.
            Todo o conteúdo do quiz (perguntas, opções, respostas) DEVE ser em Português do Brasil (PT-BR).
        `;

        console.log(`Chamando API Gemini: Tema="${theme}", Dificuldade=${difficulty}, Questões=${questionCount}`);

        try {
            const generationConfig = { responseMimeType: "application/json" };
            const safetySettings = [
                { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
                { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
                { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
                { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
            ];
            const request = {
                contents: [{ role: "user", parts: [{ text: userPrompt }] }],
                generationConfig,
                safetySettings
            };

            const result = await model.generateContent(request);
            const response = result.response;

            if (response.promptFeedback && response.promptFeedback.blockReason) {
                const { blockReason, safetyRatings } = response.promptFeedback;
                const safetyRatingsInfo = safetyRatings?.map(r => `${r.category.replace('HARM_CATEGORY_', '')}: ${r.probability}`).join(', ') || 'N/A';
                throw new Error(`Criação do quiz bloqueada pela IA. Motivo: ${blockReason}. (Detalhes: ${safetyRatingsInfo})`);
            }

            const responseText = response.text();
            if (!responseText || responseText.trim() === "") {
                throw new Error("A IA retornou uma resposta vazia. Tente um tema diferente.");
            }

            let parsedQuizData = JSON.parse(responseText);

            if (!Array.isArray(parsedQuizData) || parsedQuizData.length === 0) {
                throw new Error("A IA retornou dados em formato inesperado. Tente novamente.");
            }
            // Validações adicionais da estrutura do quizData podem ser adicionadas aqui se necessário

            return parsedQuizData;

        } catch (apiError) {
            console.error('Erro na chamada da API Gemini ou processamento:', apiError);
            throw apiError; // Re-throw para ser pego pelo chamador
        }
    }


    generateQuizBtn.addEventListener('click', async () => {
        const apiKey = apiKeyInput.value.trim();
        const theme = themeInput.value.trim();
        const difficulty = difficultySelect.value;
        const numQuestionsValue = numQuestionsSelect.value;
        const useTestQuiz = testQuizCheckbox.checked;

        errorMessage.textContent = '';

        if (useTestQuiz) {
            const questionsForTest = Math.min(parseInt(numQuestionsValue, 10), simpleTestQuiz.length);
            quizData = simpleTestQuiz.slice(0, questionsForTest);
            if (quizData.length === 0 && simpleTestQuiz.length > 0) {
                quizData = [simpleTestQuiz[0]];
            } else if (quizData.length === 0) {
                errorMessage.textContent = "Quiz de teste não disponível no momento.";
                return;
            }
            startQuiz("Quiz Teste");
            return;
        }

        // Validação da API Key e tema movida para antes da chamada da API
        if (!apiKey) {
            errorMessage.textContent = "Por favor, insira sua Chave de API.";
            return;
        }
        if (!theme) {
            errorMessage.textContent = "Não esqueça de dizer o tema do quiz";
            return;
        }

        loadingMessage.classList.remove('hidden');
        generateQuizBtn.disabled = true;
        quizArea.classList.add('hidden');
        resultArea.classList.add('hidden');

        try {
            // CHAMADA DIRETA À API DO GEMINI DO FRONTEND
            const generatedQuiz = await callGeminiAPI(apiKey, theme, difficulty, numQuestionsValue);

            if (generatedQuiz && generatedQuiz.length > 0) {
                quizData = generatedQuiz;
                startQuiz();
            } else {
                throw new Error("Recebemos uma resposta, mas parece que o quiz está vazio. Tente um tema diferente!");
            }

        } catch (error) {
            console.error("Erro ao gerar quiz (direto do frontend):", error);
            errorMessage.textContent = `Ops! Algo deu errado: ${error.message}`;
        } finally {
            loadingMessage.classList.add('hidden');
            generateQuizBtn.disabled = false;
        }
    });

    function startQuiz(customTitle = null) {
        currentQuestionIndex = 0;
        userAnswers = new Array(quizData.length).fill(null);
        setupArea.classList.add('hidden');
        resultArea.classList.add('hidden');
        quizArea.classList.remove('hidden');
        quizTitle.textContent = customTitle ? customTitle : `Quiz sobre: ${themeInput.value}`;

        timeLeft = quizData.length * 30;
        startTimer();
        displayQuestion();
    }

    function displayQuestion() {
        if (currentQuestionIndex < 0 || currentQuestionIndex >= quizData.length) return;

        const question = quizData[currentQuestionIndex];
        questionNumberDisplay.textContent = `Pergunta ${currentQuestionIndex + 1} de ${quizData.length}`;
        questionTextDisplay.textContent = question.question;
        optionsContainer.innerHTML = '';

        question.options.forEach((option, index) => {
            const radioId = `option${index}`;
            const input = document.createElement('input');
            input.type = 'radio';
            input.name = 'quizOption';
            input.value = option;
            input.id = radioId;
            if (userAnswers[currentQuestionIndex] === option) {
                input.checked = true;
            }
            input.addEventListener('change', () => {
                userAnswers[currentQuestionIndex] = option;
            });

            const label = document.createElement('label');
            label.htmlFor = radioId;
            label.textContent = option;
            label.style.display = 'inline';
            label.style.marginLeft = '5px';
            label.style.fontWeight = 'normal';

            const div = document.createElement('div');
            div.appendChild(input);
            div.appendChild(label);
            optionsContainer.appendChild(div);
        });

        prevQuestionBtn.disabled = currentQuestionIndex === 0;
        nextQuestionBtn.classList.toggle('hidden', currentQuestionIndex === quizData.length - 1);
        submitQuizBtn.classList.toggle('hidden', currentQuestionIndex !== quizData.length - 1);
    }

    function startTimer() {
        clearInterval(timerInterval);
        updateTimerDisplay();
        timerInterval = setInterval(() => {
            timeLeft--;
            updateTimerDisplay();
            if (timeLeft <= 0) {
                clearInterval(timerInterval);
                alert("O tempo acabou!");
                showResults();
            }
        }, 1000);
    }

    function updateTimerDisplay() {
        const minutes = Math.floor(timeLeft / 60);
        const seconds = timeLeft % 60;
        timerDisplaySpan.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    prevQuestionBtn.addEventListener('click', () => {
        if (currentQuestionIndex > 0) {
            currentQuestionIndex--;
            displayQuestion();
        }
    });

    nextQuestionBtn.addEventListener('click', () => {
        if (currentQuestionIndex < quizData.length - 1) {
            currentQuestionIndex++;
            displayQuestion();
        }
    });

    submitQuizBtn.addEventListener('click', () => {
        clearInterval(timerInterval);
        showResults();
    });

    function showResults() {
        let score = 0;
        for (let i = 0; i < quizData.length; i++) {
            if (userAnswers[i] && userAnswers[i] === quizData[i].correctAnswer) {
                score++;
            }
        }
        quizArea.classList.add('hidden');
        resultArea.classList.remove('hidden');
        scoreDisplay.textContent = `Sua pontuação: ${score} de ${quizData.length}`;
    }

    restartQuizBtn.addEventListener('click', () => {
        resultArea.classList.add('hidden');
        setupArea.classList.remove('hidden');
        themeInput.value = "Matemática Básica";
        difficultySelect.value = "easy";
        numQuestionsSelect.value = "4";
        testQuizCheckbox.checked = false;
        quizTitle.textContent = "Monte seu Quiz";
        errorMessage.textContent = '';
        // apiKeyInput.value = ""; // Opcional: limpar a chave de API ao reiniciar
    });
});