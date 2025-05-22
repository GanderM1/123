class TestManager {
  constructor() {
    this.modal = document.getElementById("testModal");
    this.statsModal = document.getElementById("statsModal");
    this.addTestBtn = document.getElementById("add-test-btn");
    this.testTableBody = document.getElementById("test-table-body");
    this.currentUser = JSON.parse(localStorage.getItem("user") || "{}");
    this.currentTestId = null;
    this.init();
  }

  init() {
    if (this.addTestBtn) {
      this.addTestBtn.addEventListener("click", () => this.showCreateModal());
    }

    this.loadTests();
  }

  async loadTests() {
    try {
      const response = await fetch("/api/tests");
      if (!response.ok) throw new Error("Ошибка загрузки тестов");

      let tests = await response.json();

      // Если пользователь не админ - фильтруем тесты
      if (this.currentUser.role !== "admin") {
        tests = tests.filter(
          (test) =>
            test.author_id === this.currentUser.id || // Свои тесты
            test.author_id === null || // Общие тесты (если есть)
            test.author_id === undefined // На всякий случай
        );
      }

      this.renderTests(tests);
    } catch (error) {
      console.error("Ошибка:", error);
      alert("Не удалось загрузить тесты");
    }
  }

  canViewStats(test) {
    return (
      this.currentUser.role === "admin" || this.currentUser.role === "teacher"
    );
  }

  async showTestStatistics(testId) {
    try {
      const response = await fetch(`/api/tests/${testId}/statistics`, {
        headers: {
          Authorization: `Bearer ${this.getToken()}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Ошибка загрузки статистики");
      }

      const statistics = await response.json();
      this.renderStatisticsModal(statistics);
    } catch (error) {
      console.error("Ошибка:", error);
      alert(error.message || "Не удалось загрузить статистику теста");
    }
  }

  renderStatisticsModal(statistics) {
    if (!this.statsModal) {
      this.createStatsModal();
    }

    const tableBody = this.statsModal.querySelector("#statsTableBody");
    tableBody.innerHTML = "";

    // Добавляем строки для каждого пользователя
    statistics.userStats.forEach((user) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${user.username}</td>
        <td>${user.group || "Не указана"}</td>
        <td>${user.attempts}</td>
        <td>${user.bestScore}%</td>
        <td>${user.worstScore}%</td>
        <td>${user.averageScore}%</td>
      `;
      tableBody.appendChild(row);
    });

    // Обновляем сводную информацию
    this.statsModal.querySelector("#totalUsers").textContent =
      statistics.totalUsers;
    this.statsModal.querySelector("#totalAttempts").textContent =
      statistics.totalAttempts;

    // Показываем модальное окно
    this.statsModal.classList.add("active");

    document.addEventListener("keydown", this.handleStatsKeyDown);
    this.statsModal.classList.add("active");
  }

  createStatsModal() {
    const modalHTML = `
      <div class="modal" id="statsModal">
        <div class="modal-content" style="max-width: 900px;">
          <span class="close">&times;</span>
          <h3>Статистика теста</h3>
          
          <div class="user-filter">
            <input type="text" id="userSearch" placeholder="Поиск по имени пользователя...">
            <button id="refreshStats">Обновить</button>
          </div>
          
          <div class="stats-table-container">
            <table class="stats-table">
              <thead>
                <tr>
                  <th>Пользователь</th>
                  <th>Группа</th>
                  <th>Попытки</th>
                  <th>Лучший результат</th>
                  <th>Худший результат</th>
                  <th>Средний результат</th>
                </tr>
              </thead>
              <tbody id="statsTableBody">
                <!-- Данные будут загружены динамически -->
              </tbody>
            </table>
          </div>
          
          <div class="stats-summary">
            <div class="summary-item">
              <span class="summary-label">Всего пользователей:</span>
              <span class="summary-value" id="totalUsers">0</span>
            </div>
            <div class="summary-item">
              <span class="summary-label">Всего попыток:</span>
              <span class="summary-value" id="totalAttempts">0</span>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML("beforeend", modalHTML);
    this.statsModal = document.getElementById("statsModal");

    // Обработчик закрытия
    this.statsModal.querySelector(".close").addEventListener("click", () => {
      this.statsModal.classList.remove("active");
    });

    // Обработчик нажатия клавиши ESC
    this.handleStatsKeyDown = (e) => {
      if (e.key === "Escape") {
        this.statsModal.classList.remove("active");
        document.removeEventListener("keydown", this.handleStatsKeyDown);
      }
    };

    document.addEventListener("keydown", this.handleStatsKeyDown);

    // Обработчик обновления данных
    this.statsModal
      .querySelector("#refreshStats")
      .addEventListener("click", () => {
        if (this.currentTestId) {
          this.showTestStatistics(this.currentTestId);
        }
      });

    // Поиск по пользователям
    this.statsModal
      .querySelector("#userSearch")
      .addEventListener("input", (e) => {
        this.filterStatsTable(e.target.value);
      });
  }

  filterStatsTable(searchTerm) {
    const rows = this.statsModal.querySelectorAll("#statsTableBody tr");
    const term = searchTerm.toLowerCase();

    rows.forEach((row) => {
      const username = row.cells[0].textContent.toLowerCase();
      row.style.display = username.includes(term) ? "" : "none";
    });
  }

  renderTests(tests) {
    this.testTableBody.innerHTML = "";

    tests.forEach((test) => {
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${test.id}</td>
        <td>${test.title}</td>
        <td>${test.author || "Неизвестно"}</td>
        <td>${test.question_count || 0}</td>
        <td>
          <button class="edit-btn" data-id="${test.id}" ${
        this.canEditTest(test) ? "" : "disabled"
      }>✏️</button>
          <button class="stats-btn" data-id="${test.id}" ${
        this.canViewStats(test) ? "" : "disabled"
      }>📊</button>
          <button class="delete-btn" data-id="${test.id}" ${
        this.canDeleteTest(test) ? "" : "disabled"
      }>🗑️</button>
        </td>
      `;
      this.testTableBody.appendChild(row);
    });

    this.setupActionButtons();
  }

  canEditTest(test) {
    return (
      this.currentUser.role === "admin" ||
      (this.currentUser.role === "teacher" &&
        test.author_id === this.currentUser.id)
    );
  }

  canDeleteTest(test) {
    return (
      this.currentUser.role === "admin" ||
      (this.currentUser.role === "teacher" &&
        test.author_id === this.currentUser.id)
    );
  }

  setupActionButtons() {
    document.querySelectorAll(".stats-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const testId = e.target.dataset.id;
        this.showTestStatistics(testId);
      });
    });

    document.querySelectorAll(".edit-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const testId = e.target.dataset.id;
        this.editTest(testId);
      });
    });

    document.querySelectorAll(".delete-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        const testId = e.target.dataset.id;
        this.deleteTest(testId);
      });
    });
  }

  async saveTestAttempt(testId, answers) {
    try {
      const response = await fetch(`/api/tests/${testId}/attempts`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.getToken()}`,
        },
        body: JSON.stringify({ answers }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to submit test");
      }

      return await response.json();
    } catch (error) {
      console.error("Error submitting test:", error);
      throw error;
    }
  }

  showCreateModal() {
    if (!this.modal) {
      this.createModal();
    }

    this.resetModal();
    this.currentTestId = null;
    this.modal.classList.add("active");
    document.addEventListener("keydown", this.handleKeyDown);
  }

  async editTest(testId) {
    try {
      const response = await fetch(`/api/tests/${testId}`);
      if (!response.ok) throw new Error("Ошибка загрузки теста");

      const test = await response.json();
      this.showEditModal(test);
    } catch (error) {
      console.error("Ошибка при редактировании:", error);
      alert("Не удалось загрузить тест для редактирования");
    }
  }

  showEditModal(test) {
    if (!this.modal) {
      this.createModal();
    }

    this.resetModal();
    this.currentTestId = test.id;

    document.getElementById("test-title").value = test.title;

    const questionsContainer = document.getElementById("questions-container");
    questionsContainer.innerHTML = "";

    test.questions.forEach((question) => {
      const questionId = Date.now();
      const questionHTML = `
        <div class="question" data-id="${questionId}" data-type="${
        question.question_type
      }">
          <div class="form-group">
            <label>Текст вопроса</label>
            <textarea class="question-text" required>${question.text}</textarea>
          </div>
          <div class="form-group">
            <label>Тип вопроса</label>
            <select class="question-type">
              <option value="single" ${
                question.question_type === "single" ? "selected" : ""
              }>Один ответ</option>
              <option value="multiple" ${
                question.question_type === "multiple" ? "selected" : ""
              }>Несколько ответов</option>
              <option value="text" ${
                question.question_type === "text" ? "selected" : ""
              }>Текстовый ответ</option>
            </select>
          </div>
          
          ${
            question.question_type === "text"
              ? `
            <div class="form-group correct-text-answer">
              <label class="label_text">Правильный текстовый ответ</label>
              <input type="text" class="correct-text" value="${
                question.correct_text_answer || ""
              }" required>
            </div>
          `
              : ""
          }
          
          <div class="answers-container" ${
            question.question_type === "text" ? 'style="display:none;"' : ""
          }>
            ${
              question.question_type !== "text"
                ? question.answers
                    .map(
                      (answer) => `
              <div class="answer" data-id="${Date.now()}">
                <input type="text" class="answer-text" value="${
                  answer.text
                }" required>
                <label class="labe_css">
                  <input type="${
                    question.question_type === "multiple" ? "checkbox" : "radio"
                  }" 
                         name="correct-${questionId}"
                         class="is-correct" 
                         ${answer.is_correct ? "checked" : ""}> 
                  Правильный
                </label>
                <button type="button" class="remove-answer">×</button>
              </div>
            `
                    )
                    .join("")
                : ""
            }
          </div>
          
          ${
            question.question_type !== "text"
              ? `
            <button type="button" class="add-answer">Добавить ответ</button>
          `
              : ""
          }
          <button type="button" class="remove-question">Удалить вопрос</button>
        </div>
      `;

      questionsContainer.insertAdjacentHTML("beforeend", questionHTML);

      const questionEl = questionsContainer.querySelector(
        `[data-id="${questionId}"]`
      );

      questionEl
        .querySelector(".question-type")
        .addEventListener("change", (e) => {
          this.handleQuestionTypeChange(questionEl, e.target.value);
        });

      if (question.question_type !== "text") {
        questionEl
          .querySelector(".add-answer")
          .addEventListener("click", () => {
            this.addAnswer(questionId);
          });
      }

      questionEl
        .querySelector(".remove-question")
        .addEventListener("click", () => {
          questionEl.remove();
        });
    });

    this.modal.classList.add("active");
    document.addEventListener("keydown", this.handleKeyDown);
  }

  handleQuestionTypeChange(questionEl, newType) {
    questionEl.dataset.type = newType;
    const answersContainer = questionEl.querySelector(".answers-container");
    const correctTextAnswer = questionEl.querySelector(".correct-text-answer");

    if (newType === "text") {
      answersContainer.style.display = "none";

      if (!correctTextAnswer) {
        questionEl.insertAdjacentHTML(
          "beforeend",
          `
          <div class="form-group correct-text-answer">
            <label class="label_text">Правильный текстовый ответ</label>
            <input type="text" class="correct-text" name="correct-text-${questionEl.dataset.id}" required>
          </div>
        `
        );
      } else {
        correctTextAnswer.style.display = "block";
        correctTextAnswer
          .querySelector(".correct-text")
          .setAttribute("required", "");
      }

      // Убираем required у скрытых полей ответов
      questionEl.querySelectorAll(".answer-text").forEach((input) => {
        input.removeAttribute("required");
      });

      const addAnswerBtn = questionEl.querySelector(".add-answer");
      if (addAnswerBtn) addAnswerBtn.style.display = "none";
    } else {
      if (correctTextAnswer) {
        correctTextAnswer.style.display = "none";
        correctTextAnswer
          .querySelector(".correct-text")
          .removeAttribute("required");
      }

      answersContainer.style.display = "block";
      questionEl.querySelectorAll(".answer-text").forEach((input) => {
        input.setAttribute("required", "");
      });

      const addAnswerBtn = questionEl.querySelector(".add-answer");
      if (!addAnswerBtn) {
        answersContainer.insertAdjacentHTML(
          "afterend",
          `
          <button type="button" class="add-answer">Добавить ответ</button>
        `
        );
        questionEl
          .querySelector(".add-answer")
          .addEventListener("click", () => {
            this.addAnswer(questionEl.dataset.id);
          });
      } else {
        addAnswerBtn.style.display = "inline-block";
      }

      questionEl.querySelectorAll(".is-correct").forEach((input) => {
        input.type = newType === "multiple" ? "checkbox" : "radio";
        input.name = `correct-${questionEl.dataset.id}`;
      });
    }
  }

  resetModal() {
    if (this.modal) {
      document.getElementById("test-title").value = "";
      document.getElementById("questions-container").innerHTML = "";
    }
  }

  async deleteTest(testId) {
    if (!confirm("Вы уверены, что хотите удалить этот тест?")) return;

    try {
      const response = await fetch(`/api/tests/${testId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${this.getToken()}`,
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Ошибка удаления теста");
      }

      this.loadTests();
      alert("Тест успешно удален");
    } catch (error) {
      console.error("Ошибка при удалении:", error);
      alert(error.message);
    }
  }

  createModal() {
    const modalHTML = `
      <div class="modal" id="testModal">
        <div class="modal-content">
          <span class="close">&times;</span>
          <h3 id="modal-title">${
            this.currentTestId ? "Редактировать тест" : "Создать новый тест"
          }</h3>
          
          <form id="test-form">
            <div class="form-group">
              <label for="test-title">Название теста</label>
              <input type="text" id="test-title" required>
            </div>
            
            <div id="questions-container">
              <!-- Вопросы будут здесь -->
            </div>
            
            <button type="button" id="add-question" class="btn">Добавить вопрос</button>
            <button type="submit" class="btn primary">Сохранить тест</button>
          </form>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML("beforeend", modalHTML);
    this.modal = document.getElementById("testModal");
    this.setupModalEvents();
  }

  setupModalEvents() {
    const closeModal = () => {
      this.modal.classList.remove("active");
      document.removeEventListener("keydown", this.handleKeyDown);
      this.currentTestId = null;
    };

    this.modal.querySelector(".close").addEventListener("click", closeModal);

    this.modal.querySelector("#add-question").addEventListener("click", () => {
      this.addQuestion();
    });

    this.modal.querySelector("#test-form").addEventListener("submit", (e) => {
      e.preventDefault();
      this.saveTest();
    });

    this.handleKeyDown = (e) => {
      if (e.key === "Escape") {
        this.modal.classList.remove("active");
        document.removeEventListener("keydown", this.handleKeyDown);
        this.currentTestId = null;
      }
    };
  }

  addQuestion() {
    const questionsContainer = this.modal.querySelector("#questions-container");
    const questionId = Date.now();

    const questionHTML = `
      <div class="question" data-id="${questionId}" data-type="single">
        <div class="form-group">
          <label>Текст вопроса</label>
          <textarea class="question-text" required></textarea>
        </div>
        
        <div class="form-group">
          <label>Тип вопроса</label>
          <select class="question-type">
            <option value="single" selected>Один ответ</option>
            <option value="multiple">Несколько ответов</option>
            <option value="text">Текстовый ответ</option>
          </select>
        </div>
        
        <div class="answers-container">
          <!-- Варианты ответов -->
        </div>
        
        <button type="button" class="add-answer">Добавить ответ</button>
        <button type="button" class="remove-question">Удалить вопрос</button>
      </div>
    `;

    questionsContainer.insertAdjacentHTML("beforeend", questionHTML);

    const questionEl = questionsContainer.querySelector(
      `[data-id="${questionId}"]`
    );
    questionEl.querySelector(".add-answer").addEventListener("click", () => {
      this.addAnswer(questionId);
    });

    questionEl
      .querySelector(".question-type")
      .addEventListener("change", (e) => {
        this.handleQuestionTypeChange(questionEl, e.target.value);
      });

    questionEl
      .querySelector(".remove-question")
      .addEventListener("click", () => {
        questionEl.remove();
      });

    // Добавляем первый ответ по умолчанию
    this.addAnswer(questionId);
  }

  addAnswer(questionId) {
    const questionEl = this.modal.querySelector(`[data-id="${questionId}"]`);
    const questionType = questionEl.dataset.type;
    const answersContainer = questionEl.querySelector(".answers-container");
    const answerId = Date.now();

    const answerHTML = `
      <div class="answer" data-id="${answerId}">
        <input type="text" class="answer-text" placeholder="Текст ответа" required>
        <label class="labe_css">
          <input type="${questionType === "multiple" ? "checkbox" : "radio"}" 
                 class="is-correct" 
                 name="correct-${questionId}">
          Правильный
        </label>
        <button type="button" class="remove-answer">×</button>
      </div>
    `;

    answersContainer.insertAdjacentHTML("beforeend", answerHTML);

    answersContainer
      .querySelector(`[data-id="${answerId}"] .remove-answer`)
      .addEventListener("click", function () {
        this.closest(".answer").remove();
      });
  }

  async saveTest() {
    try {
      // Временно убираем required у скрытых полей
      this.modal.querySelectorAll("[required]").forEach((el) => {
        if (el.offsetParent === null) {
          el.removeAttribute("required");
        }
      });

      const testData = this.collectTestData();
      console.log("Отправляемые данные:", JSON.stringify(testData, null, 2)); // Логируем данные

      const url = this.currentTestId
        ? `/api/tests/${this.currentTestId}`
        : "/api/tests";
      const method = this.currentTestId ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.getToken()}`,
        },
        body: JSON.stringify(testData),
      });

      const responseData = await response.json();

      if (!response.ok) {
        console.error("Детали ошибки:", responseData);
        throw new Error(responseData.error || "Ошибка сохранения теста");
      }

      this.modal.classList.remove("active");
      this.loadTests();
      alert(`Тест успешно ${this.currentTestId ? "обновлён" : "создан"}!`);
    } catch (error) {
      console.error("Полная ошибка:", error);
      alert(`Ошибка: ${error.message}\nПроверьте консоль для деталей.`);
    }
  }

  collectTestData() {
    const testTitle = this.modal.querySelector("#test-title").value.trim();
    const questions = [];

    this.modal.querySelectorAll(".question").forEach((qEl, qIndex) => {
      const questionText = qEl.querySelector(".question-text").value.trim();
      const questionType = qEl.querySelector(".question-type").value;

      if (questionType === "text") {
        const correctText =
          qEl.querySelector(".correct-text")?.value.trim() || "";
        questions.push({
          text: questionText,
          question_type: questionType,
          correct_text_answer: correctText,
          answers: [],
        });
      } else {
        const answers = [];
        qEl.querySelectorAll(".answer").forEach((aEl, aIndex) => {
          const answerText = aEl.querySelector(".answer-text").value.trim();
          if (answerText) {
            // Добавляем только ответы с текстом
            answers.push({
              text: answerText,
              is_correct: aEl.querySelector(".is-correct").checked,
            });
          }
        });

        questions.push({
          text: questionText,
          question_type: questionType,
          answers,
        });
      }
    });

    return {
      title: testTitle,
      questions,
      author_id: this.currentUser.id,
    };
  }

  validateTestData(data) {
    if (!data.title || data.title.trim().length < 3) {
      throw new Error("Название теста обязательно (мин. 3 символа)");
    }

    if (!data.questions || data.questions.length === 0) {
      throw new Error("Тест должен содержать хотя бы один вопрос");
    }

    data.questions.forEach((q, qIndex) => {
      if (!q.text || q.text.trim().length === 0) {
        throw new Error(`Вопрос ${qIndex + 1}: текст вопроса обязателен`);
      }

      if (q.question_type === "text") {
        if (!q.correct_text_answer || q.correct_text_answer.trim() === "") {
          throw new Error(
            `Вопрос ${i + 1}: укажите правильный текстовый ответ`
          );
        }
      } else {
        if (!q.answers || q.answers.length === 0) {
          throw new Error(`Вопрос ${qIndex + 1}: добавьте хотя бы один ответ`);
        }

        const correctAnswers = q.answers.filter((a) => a.is_correct).length;
        if (correctAnswers === 0) {
          throw new Error(
            `Вопрос ${qIndex + 1}: укажите хотя бы один правильный ответ`
          );
        }

        if (q.question_type === "single" && correctAnswers > 1) {
          throw new Error(
            `Вопрос ${qIndex + 1}: можно выбрать только один правильный ответ`
          );
        }
      }
    });
  }

  getToken() {
    return (
      localStorage.getItem("token") ||
      document.cookie
        .split("; ")
        .find((row) => row.startsWith("token="))
        ?.split("=")[1]
    );
  }
}

// Инициализация при загрузке страницы
document.addEventListener("DOMContentLoaded", () => {
  new TestManager();
});
