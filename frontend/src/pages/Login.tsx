import { FormEvent, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { ApiError, login } from "../api/client";
import "./Login.css";

interface LoginLocationState {
  from?: string;
}

export function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(username, password);
      const state = location.state as LoginLocationState | null;
      navigate(state?.from ?? "/", { replace: true });
    } catch (caughtError) {
      if (caughtError instanceof ApiError && caughtError.status === 429) {
        setError("Забагато спроб. Спробуйте ще раз за 15 хвилин.");
      } else {
        setError("Невірний логін або пароль.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <div className="login-brand" aria-hidden="true">HT</div>
        <p className="login-eyebrow">Портал орендодавця</p>
        <h1 id="login-title">Вітаємо в HomeTrap</h1>
        <p className="login-lead">Увійдіть, щоб керувати квартирами та рахунками.</p>

        <form onSubmit={handleSubmit}>
          <label htmlFor="username">Логін</label>
          <input
            id="username"
            name="username"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
          />

          <label htmlFor="password">Пароль</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />

          {error && <p className="login-error" role="alert">{error}</p>}

          <button type="submit" disabled={submitting}>
            {submitting ? "Входимо…" : "Увійти"}
          </button>
        </form>
      </section>
    </main>
  );
}
