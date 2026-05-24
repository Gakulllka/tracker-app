"use client";
/**
 * useQuestions — CRUD вопросов и ответов.
 * Вынесено из TaskTrackerInner.
 */
import { useState, useCallback } from "react";
import { mapQuestionFromAPI } from "@/lib/questions";
import type { Question } from "@/lib/questions";

export function useQuestions(currentUsername: string) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [newQuestionText, setNewQuestionText] = useState("");

  const addQuestion = useCallback(async () => {
    if (!newQuestionText.trim()) return;
    try {
      const res = await fetch("/api/question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: newQuestionText.trim(), author: currentUsername }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.question) setQuestions(prev => [...prev, mapQuestionFromAPI(data.question)]);
      }
    } catch { /* silent */ }
    setNewQuestionText("");
  }, [newQuestionText, currentUsername]);

  const addQuestionDirect = useCallback(async (text: string, author: string) => {
    if (!text.trim()) return;
    try {
      const res = await fetch("/api/question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text.trim(), author: author || "AI-ассистент" }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.question) setQuestions(prev => [...prev, mapQuestionFromAPI(data.question)]);
      }
    } catch { /* silent */ }
  }, []);

  const addLinkedQuestion = useCallback(async (
    text: string, author: string, linkedTaskId: string, linkedTaskName: string
  ) => {
    if (!text.trim()) return;
    try {
      const res = await fetch("/api/question", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text.trim(), author }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.question) {
          setQuestions(prev => [...prev, { ...mapQuestionFromAPI(data.question), linkedTaskId, linkedTaskName }]);
          return;
        }
      }
    } catch { /* optimistic fallback */ }
    setQuestions(prev => [...prev, {
      id: crypto.randomUUID(), text: text.trim(), author,
      answers: [], questionDate: new Date().toISOString(), linkedTaskId, linkedTaskName,
    }]);
  }, []);

  const removeQuestion = useCallback(async (id: string) => {
    setQuestions(prev => prev.filter(q => q.id !== id));
    try { await fetch(`/api/question?id=${id}`, { method: "DELETE" }); } catch { /* silent */ }
  }, []);

  const answerQuestion = useCallback(async (questionId: string, answerText: string, authorName: string) => {
    try {
      const res = await fetch("/api/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId, answer: answerText, author: authorName }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.answers) {
          setQuestions(prev => prev.map(q =>
            q.id === questionId ? { ...q, answers: data.answers, answerDate: new Date().toISOString() } : q
          ));
          return;
        }
      }
    } catch { /* fall through to optimistic */ }
    setQuestions(prev => prev.map(q =>
      q.id === questionId ? {
        ...q,
        answers: [...(q.answers || []), { id: crypto.randomUUID(), author: authorName, text: answerText, date: new Date().toISOString() }],
        answerDate: new Date().toISOString(),
      } : q
    ));
  }, []);

  const deleteAnswer = useCallback(async (questionId: string, answerId: string) => {
    try { await fetch(`/api/answer?questionId=${questionId}&answerId=${answerId}`, { method: "DELETE" }); } catch { /* silent */ }
    setQuestions(prev => prev.map(q =>
      q.id === questionId ? { ...q, answers: (q.answers || []).filter(a => a.id !== answerId) } : q
    ));
  }, []);

  return {
    questions, setQuestions,
    newQuestionText, setNewQuestionText,
    addQuestion, addQuestionDirect, addLinkedQuestion,
    removeQuestion, answerQuestion, deleteAnswer,
  };
}
