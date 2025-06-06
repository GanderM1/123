const express = require("express");
const router = express.Router();
const db = require("../models/db");

// Получение списка тестов (исправленная версия)
router.get("/", async (req, res) => {
  try {
    // Убрано условие WHERE с подзапросом, которое могло фильтровать все тесты
    const [tests] = await db.query(`
      SELECT t.id, t.title, t.description, u.username as author, t.author_id
      FROM tests t
      LEFT JOIN users u ON t.author_id = u.id
    `);

    // Добавляем количество вопросов для каждого теста
    const testsWithQuestionCount = await Promise.all(
      tests.map(async (test) => {
        const [count] = await db.query(
          "SELECT COUNT(*) as count FROM questions WHERE test_id = ?",
          [test.id]
        );
        return {
          ...test,
          question_count: count[0].count,
        };
      })
    );

    res.json(testsWithQuestionCount);
  } catch (err) {
    console.error("Ошибка получения тестов:", err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// Получение конкретного теста (оставлен без изменений, т.к. работает)
router.get("/:id", async (req, res) => {
  try {
    const [tests] = await db.query(
      `SELECT t.id, t.title, t.description, t.author_id, u.username as author 
       FROM tests t
       LEFT JOIN users u ON t.author_id = u.id
       WHERE t.id = ?`,
      [req.params.id]
    );

    if (tests.length === 0) {
      return res.status(404).json({ error: "Тест не найден" });
    }

    const [questions] = await db.query(
      "SELECT id, text, question_type, correct_text_answer FROM questions WHERE test_id = ?",
      [req.params.id]
    );

    const test = tests[0];
    test.questions = await Promise.all(
      questions.map(async (q) => {
        if (q.question_type === "text") {
          return {
            ...q,
            answers: [],
          };
        }

        const [answers] = await db.query(
          "SELECT id, text, is_correct FROM answers WHERE question_id = ?",
          [q.id]
        );
        return { ...q, answers };
      })
    );

    res.json(test);
  } catch (err) {
    console.error("Ошибка получения теста:", err);
    res.status(500).json({ error: "Ошибка сервера" });
  }
});

// Создание теста (оставлено без изменений)
router.post("/", async (req, res) => {
  if (!["teacher", "admin"].includes(req.user.role)) {
    return res
      .status(403)
      .json({ error: "Доступ запрещён. Требуется роль teacher или admin" });
  }

  if (
    !req.body.title ||
    typeof req.body.title !== "string" ||
    req.body.title.trim().length < 3
  ) {
    return res
      .status(400)
      .json({ error: "Название теста обязательно (мин. 3 символа)" });
  }

  if (!Array.isArray(req.body.questions) || req.body.questions.length === 0) {
    return res
      .status(400)
      .json({ error: "Тест должен содержать хотя бы один вопрос" });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [testResult] = await connection.query(
      "INSERT INTO tests (title, description, author_id) VALUES (?, ?, ?)",
      [req.body.title.trim(), req.body.description || "", req.user.id]
    );
    const testId = testResult.insertId;

    for (const [qIndex, question] of req.body.questions.entries()) {
      if (
        !question.text ||
        typeof question.text !== "string" ||
        question.text.trim().length === 0
      ) {
        throw new Error(`Вопрос ${qIndex + 1}: текст вопроса обязателен`);
      }

      if (
        question.question_type !== "text" &&
        (!Array.isArray(question.answers) || question.answers.length === 0)
      ) {
        throw new Error(
          `Вопрос ${qIndex + 1}: должен содержать хотя бы один ответ`
        );
      }

      const [questionResult] = await connection.query(
        "INSERT INTO questions (test_id, text, question_type, correct_text_answer) VALUES (?, ?, ?, ?)",
        [
          testId,
          question.text.trim(),
          question.question_type || "single",
          question.question_type === "text"
            ? question.correct_text_answer
            : null,
        ]
      );
      const questionId = questionResult.insertId;

      if (question.question_type !== "text") {
        const hasCorrectAnswer = question.answers.some((a) => a.is_correct);
        if (!hasCorrectAnswer && question.question_type !== "text") {
          throw new Error(
            `Вопрос ${
              qIndex + 1
            }: должен содержать хотя бы один правильный ответ`
          );
        }

        for (const [aIndex, answer] of question.answers.entries()) {
          if (
            !answer.text ||
            typeof answer.text !== "string" ||
            answer.text.trim().length === 0
          ) {
            throw new Error(
              `Вопрос ${qIndex + 1}, ответ ${
                aIndex + 1
              }: текст ответа обязателен`
            );
          }

          await connection.query(
            "INSERT INTO answers (question_id, text, is_correct) VALUES (?, ?, ?)",
            [questionId, answer.text.trim(), answer.is_correct ? 1 : 0]
          );
        }
      }
    }

    await connection.commit();
    res
      .status(201)
      .json({ success: true, testId, message: "Тест успешно создан" });
  } catch (err) {
    await connection.rollback();
    console.error("Ошибка при создании теста:", err.message);
    res.status(400).json({ error: err.message });
  } finally {
    connection.release();
  }
});

// Обновление теста (новая реализация)
router.put("/:id", async (req, res) => {
  if (!["teacher", "admin"].includes(req.user.role)) {
    return res
      .status(403)
      .json({ error: "Доступ запрещён. Требуется роль teacher или admin" });
  }

  const testId = req.params.id;
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // Проверяем существование теста и права
    const [test] = await connection.query(
      "SELECT author_id FROM tests WHERE id = ?",
      [testId]
    );
    if (test.length === 0)
      return res.status(404).json({ error: "Тест не найден" });
    if (req.user.role !== "admin" && req.user.id !== test[0].author_id) {
      return res
        .status(403)
        .json({ error: "Нет прав на редактирование этого теста" });
    }

    // Обновляем основную информацию
    if (req.body.title) {
      await connection.query(
        "UPDATE tests SET title = ?, description = ? WHERE id = ?",
        [req.body.title, req.body.description || "", testId]
      );
    }

    // Полная перезапись вопросов
    if (req.body.questions) {
      // Удаляем старые вопросы и ответы
      await connection.query(
        "DELETE FROM answers WHERE question_id IN (SELECT id FROM questions WHERE test_id = ?)",
        [testId]
      );
      await connection.query("DELETE FROM questions WHERE test_id = ?", [
        testId,
      ]);

      // Добавляем новые вопросы
      for (const question of req.body.questions) {
        const [questionResult] = await connection.query(
          "INSERT INTO questions (test_id, text, question_type, correct_text_answer) VALUES (?, ?, ?, ?)",
          [
            testId,
            question.text,
            question.question_type || "single",
            question.question_type === "text"
              ? question.correct_text_answer
              : null,
          ]
        );

        if (question.question_type !== "text" && question.answers?.length > 0) {
          for (const answer of question.answers) {
            await connection.query(
              "INSERT INTO answers (question_id, text, is_correct) VALUES (?, ?, ?)",
              [questionResult.insertId, answer.text, answer.is_correct ? 1 : 0]
            );
          }
        }
      }
    }

    await connection.commit();
    res.json({ success: true, message: "Тест успешно обновлён" });
  } catch (err) {
    await connection.rollback();
    console.error("Ошибка при обновлении теста:", err);
    res.status(500).json({ error: "Ошибка сервера" });
  } finally {
    connection.release();
  }
});

// Удаление теста (оставлено без изменений)
router.delete("/:id", async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const [test] = await connection.query(
      "SELECT author_id FROM tests WHERE id = ?",
      [req.params.id]
    );
    if (test.length === 0)
      return res.status(404).json({ error: "Тест не найден" });
    if (req.user.role !== "admin" && req.user.id !== test[0].author_id) {
      return res
        .status(403)
        .json({ error: "Нет прав на удаление этого теста" });
    }

    await connection.query("DELETE FROM test_results WHERE test_id = ?", [
      req.params.id,
    ]);
    await connection.query(
      "DELETE FROM answers WHERE question_id IN (SELECT id FROM questions WHERE test_id = ?)",
      [req.params.id]
    );
    await connection.query("DELETE FROM questions WHERE test_id = ?", [
      req.params.id,
    ]);
    await connection.query("DELETE FROM tests WHERE id = ?", [req.params.id]);

    await connection.commit();
    res.json({ message: "Тест успешно удален" });
  } catch (err) {
    await connection.rollback();
    console.error("Ошибка удаления теста:", err);
    res.status(500).json({ error: "Ошибка при удалении теста" });
  } finally {
    connection.release();
  }
});

// Отправка результатов теста (оставлено без изменений)
router.post("/:id/submit", async (req, res) => {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const testId = req.params.id;
    const { answers } = req.body;
    const userId = req.user.id;

    const [test] = await connection.query("SELECT id FROM tests WHERE id = ?", [
      testId,
    ]);
    if (!test.length) return res.status(404).json({ error: "Тест не найден" });

    const [questions] = await connection.query(
      "SELECT id, question_type, correct_text_answer FROM questions WHERE test_id = ?",
      [testId]
    );
    const totalQuestions = questions.length;

    if (answers.length !== totalQuestions) {
      return res
        .status(400)
        .json({ error: "Ответы на все вопросы обязательны" });
    }

    let correctAnswers = 0;

    for (const answer of answers) {
      const question = questions.find((q) => q.id === answer.questionId);
      if (!question) continue;

      if (question.question_type === "text") {
        if (
          answer.textAnswer &&
          answer.textAnswer.trim().toLowerCase() ===
            question.correct_text_answer.trim().toLowerCase()
        ) {
          correctAnswers++;
        }
        continue;
      }

      if (question.question_type === "single") {
        const [correct] = await connection.query(
          "SELECT id FROM answers WHERE id = ? AND question_id = ? AND is_correct = 1",
          [answer.answerId, answer.questionId]
        );
        if (correct.length) correctAnswers++;
      } else if (question.question_type === "multiple") {
        const [correctAnswersDb] = await connection.query(
          "SELECT id FROM answers WHERE question_id = ? AND is_correct = 1",
          [answer.questionId]
        );
        const correctIds = correctAnswersDb.map((a) => a.id);
        const userSelectedIds = answer.answerIds || [];
        if (
          correctIds.length === userSelectedIds.length &&
          correctIds.every((id) => userSelectedIds.includes(id))
        ) {
          correctAnswers++;
        }
      }
    }

    await connection.query(
      "INSERT INTO test_results (user_id, test_id, score, total_questions) VALUES (?, ?, ?, ?)",
      [userId, testId, correctAnswers, totalQuestions]
    );

    await connection.commit();
    res.json({
      success: true,
      message: "Тест успешно завершен",
      correctAnswers,
      totalQuestions,
      percentage: Math.round((correctAnswers / totalQuestions) * 100),
    });
  } catch (error) {
    await connection.rollback();
    console.error("Ошибка при сохранении теста:", error);
    res.status(500).json({ error: "Ошибка сервера" });
  } finally {
    connection.release();
  }
});

router.delete("/:testId/questions/:questionId", async (req, res) => {
  if (!["teacher", "admin"].includes(req.user.role)) {
    return res.status(403).json({
      error: "Доступ запрещён. Требуется роль teacher или admin",
    });
  }

  const { testId, questionId } = req.params;
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    // 1. Проверяем существование теста и права доступа
    const [test] = await connection.query(
      "SELECT author_id FROM tests WHERE id = ?",
      [testId]
    );

    if (test.length === 0) {
      return res.status(404).json({ error: "Тест не найден" });
    }

    if (req.user.role !== "admin" && req.user.id !== test[0].author_id) {
      return res.status(403).json({
        error: "Нет прав на редактирование этого теста",
      });
    }

    // 2. Проверяем, что вопрос принадлежит тесту
    const [question] = await connection.query(
      "SELECT id FROM questions WHERE id = ? AND test_id = ?",
      [questionId, testId]
    );

    if (question.length === 0) {
      return res.status(404).json({
        error: "Вопрос не найден в указанном тесте",
      });
    }

    // 3. Проверяем, есть ли результаты по этому тесту
    const [results] = await connection.query(
      "SELECT id FROM test_results WHERE test_id = ?",
      [testId]
    );

    if (results.length > 0) {
      return res.status(400).json({
        error: "Нельзя удалять вопросы из теста с существующими результатами",
      });
    }

    // 4. Удаляем ответы вопроса
    await connection.query("DELETE FROM answers WHERE question_id = ?", [
      questionId,
    ]);

    // 5. Удаляем сам вопрос
    const [deleteResult] = await connection.query(
      "DELETE FROM questions WHERE id = ?",
      [questionId]
    );

    if (deleteResult.affectedRows === 0) {
      throw new Error("Вопрос не был удален");
    }

    await connection.commit();
    res.json({
      success: true,
      message: "Вопрос успешно удалён",
      deletedQuestionId: questionId,
    });
  } catch (err) {
    await connection.rollback();
    console.error("Ошибка при удалении вопроса:", err);
    res.status(500).json({
      error: "Ошибка сервера",
      details: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  } finally {
    connection.release();
  }
});

router.get("/:id/statistics", async (req, res) => {
  if (!["teacher", "admin"].includes(req.user.role)) {
    return res.status(403).json({
      error: "Доступ запрещён. Требуется роль teacher или admin",
    });
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();

    const testId = req.params.id;

    // 1. Проверка существования теста и прав доступа
    const [test] = await connection.query(
      "SELECT id, author_id FROM tests WHERE id = ?",
      [testId]
    );

    if (test.length === 0) {
      return res.status(404).json({ error: "Тест не найден" });
    }

    if (req.user.role !== "admin" && req.user.id !== test[0].author_id) {
      return res.status(403).json({
        error: "Нет прав на просмотр статистики этого теста",
      });
    }

    // 2. Получаем статистику по пользователям
    const [userStats] = await connection.query(
      `
      SELECT 
        u.id as userId,
        u.username,
        g.name as groupName,
        COUNT(tr.id) as attempts,
        MAX(tr.score/tr.total_questions*100) as bestScore,
        MIN(tr.score/tr.total_questions*100) as worstScore,
        AVG(tr.score/tr.total_questions*100) as averageScore
      FROM test_results tr
      JOIN users u ON tr.user_id = u.id
      LEFT JOIN user_groups g ON u.group_id = g.id
      WHERE tr.test_id = ?
      GROUP BY tr.user_id, u.username, u.id, g.name
      ORDER BY g.name, u.username
      `,
      [testId]
    );

    // 3. Получаем общую статистику
    const [totals] = await connection.query(
      `
      SELECT 
        COUNT(DISTINCT user_id) as totalUsers,
        COUNT(*) as totalAttempts
      FROM test_results
      WHERE test_id = ?
      `,
      [testId]
    );

    await connection.commit();

    // Форматируем результаты
    res.json({
      userStats: userStats.map((user) => ({
        ...user,
        bestScore: Math.round(user.bestScore) || 0,
        worstScore: Math.round(user.worstScore) || 0,
        averageScore: Math.round(user.averageScore) || 0,
        group: user.groupName || "Не указана",
      })),
      totalUsers: totals[0].totalUsers || 0,
      totalAttempts: totals[0].totalAttempts || 0,
    });
  } catch (err) {
    await connection.rollback();
    console.error("Ошибка получения статистики:", err);
    res.status(500).json({
      error: "Ошибка сервера",
      details: process.env.NODE_ENV === "development" ? err.message : undefined,
    });
  } finally {
    connection.release();
  }
});

module.exports = router;
