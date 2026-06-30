"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import type {
  Annotation,
  CheckResponse,
  MatchResult,
  Platform,
  RewriteResponse
} from "@/lib/quality/types";
import { requestQualityCheck, requestQualityRewrite } from "@/lib/quality/proxy-ai";

const PLATFORM_LABELS: Record<Platform, string> = {
  xiaohongshu: "小红书",
  wechat: "公众号"
};

const LEXICON_OPTIONS = [
  { id: "general", label: "通用词库" },
  { id: "sensitive", label: "敏感词" },
  { id: "xiaohongshu", label: "小红书词" },
  { id: "wechat", label: "公众号词" },
  { id: "ad", label: "广告词" },
  { id: "medical", label: "医疗词" }
];

const EMPTY_TEXT = "请输入需要检测的小红书或公众号原文";
const PUBLIC_BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";

const LANGUAGE_OPTIONS = [
  {
    value: "simplified",
    label: "简体优化稿",
    description: "适合小红书、公众号默认发布"
  },
  {
    value: "traditional",
    label: "繁体优化稿",
    description: "用于繁体受众或跨区域发布"
  }
] as const;

export function QualityWorkbench() {
  const [platform, setPlatform] = useState<Platform>("xiaohongshu");
  const [text, setText] = useState("");
  const [enabledLexicons, setEnabledLexicons] = useState<string[]>([
    "general",
    "sensitive",
    "xiaohongshu",
    "ad",
    "medical"
  ]);
  const [languagePreference, setLanguagePreference] = useState<
    "simplified" | "traditional"
  >("simplified");
  const [checkResult, setCheckResult] = useState<CheckResponse | null>(null);
  const [rewriteResult, setRewriteResult] = useState<RewriteResponse | null>(
    null
  );
  const [isChecking, setIsChecking] = useState(false);
  const [isRewriting, setIsRewriting] = useState(false);
  const [error, setError] = useState("");
  const [copyStatus, setCopyStatus] = useState("");
  const [isLanguageOpen, setIsLanguageOpen] = useState(false);
  const [isLexiconOpen, setIsLexiconOpen] = useState(false);
  const [isTraditionalNoticeOpen, setIsTraditionalNoticeOpen] = useState(false);
  const languagePickerRef = useRef<HTMLDivElement>(null);

  const selectedText = text.trim();
  const canCheck = selectedText.length > 0 && selectedText.length <= 1500;
  const isBusy = isChecking || isRewriting;
  const activeAnnotations = checkResult?.annotations ?? [];
  const enabledLexiconCount = enabledLexicons.length;
  const selectedLanguageOption = LANGUAGE_OPTIONS.find(
    (option) => option.value === languagePreference
  ) ?? LANGUAGE_OPTIONS[0];

  const matchedById = useMemo(() => {
    const map = new Map<string, MatchResult>();
    for (const match of checkResult?.matches ?? []) {
      map.set(match.id, match);
    }
    return map;
  }, [checkResult]);

  useEffect(() => {
    function handleDocumentClick(event: MouseEvent) {
      if (!languagePickerRef.current?.contains(event.target as Node)) {
        setIsLanguageOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsLanguageOpen(false);
      }
    }

    document.addEventListener("mousedown", handleDocumentClick);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleDocumentClick);
      document.removeEventListener("keydown", handleEscape);
    };
  }, []);

  async function handleCheck() {
    if (!canCheck || isBusy) return;

    setIsChecking(true);
    setError("");
    setCopyStatus("");
    setRewriteResult(null);
    setIsLanguageOpen(false);

    try {
      const data = await requestQualityCheck({
        platform,
        text,
        enabledLexicons,
        languagePreference
      });
      setCheckResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "检测失败，请稍后重试");
    } finally {
      setIsChecking(false);
    }
  }

  async function handleRewrite() {
    if (!checkResult || isBusy) return;

    setIsRewriting(true);
    setError("");
    setCopyStatus("");
    setIsLanguageOpen(false);

    try {
      const data = await requestQualityRewrite(
        checkResult.originalText,
        platform,
        languagePreference,
        checkResult.matches,
        checkResult.annotations
      );
      setRewriteResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "改写失败，请稍后重试");
    } finally {
      setIsRewriting(false);
    }
  }

  function toggleLexicon(id: string) {
    if (isBusy) return;
    setEnabledLexicons((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    );
  }

  async function handleCopyRewrite() {
    if (!rewriteResult || isBusy) return;

    try {
      await copyTextToClipboard(rewriteResult.rewrittenText);
      setCopyStatus("已复制");
    } catch {
      setCopyStatus("复制失败，请手动选择文案复制");
    }
  }

  return (
    <main className="workbench">
      <header className="app-header">
        <div className="brand-lockup">
          <span className="brand-icon-shell" aria-hidden="true">
            <Image
              alt=""
              className="brand-icon"
              height="48"
              priority
              src={`${PUBLIC_BASE_PATH}/qualitycheck-icon.png`}
              width="48"
            />
          </span>
          <div className="brand-wordmark" aria-label="QualityCheck AI 敏感詞檢測">
            <strong>QualityCheck</strong>
            <span>AI 敏感詞檢測</span>
          </div>
        </div>
      </header>

      <section className="toolbar" aria-label="检测设置">
        <div className="platform-tabs">
          {Object.entries(PLATFORM_LABELS).map(([value, label]) => (
            <button
              className={platform === value ? "tab active" : "tab"}
              disabled={isBusy}
              key={value}
              onClick={() => {
                if (isBusy) return;
                const nextPlatform = value as Platform;
                setPlatform(nextPlatform);
                setEnabledLexicons((current) =>
                  Array.from(
                    new Set([
                      "general",
                      "sensitive",
                      nextPlatform,
                      ...current.filter(
                        (item) => item !== "xiaohongshu" && item !== "wechat"
                      )
                    ])
                  )
                );
              }}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="lexicon-panel" aria-label="词库选择">
        <button
          aria-expanded={isLexiconOpen}
          className={isLexiconOpen ? "lexicon-toggle open" : "lexicon-toggle"}
          disabled={isBusy}
          onClick={() => {
            if (isBusy) return;
            setIsLexiconOpen((value) => !value);
          }}
          type="button"
        >
          <span>
            <strong>词库设置</strong>
            <small>已启用 {enabledLexiconCount} 项</small>
          </span>
          <i aria-hidden="true" />
        </button>
        {isLexiconOpen ? (
          <div className="lexicon-options">
            {LEXICON_OPTIONS.map((option) => (
              <label
                className={isBusy ? "check-pill disabled" : "check-pill"}
                key={option.id}
              >
                <input
                  checked={enabledLexicons.includes(option.id)}
                  disabled={isBusy}
                  onChange={() => toggleLexicon(option.id)}
                  type="checkbox"
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        ) : null}
      </section>

      <section className="workspace-grid">
        <div className="panel input-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">原文输入</p>
              <h1>AI 文案质检</h1>
            </div>
            <div className="language-picker" ref={languagePickerRef}>
              <button
                aria-expanded={isLanguageOpen}
                aria-haspopup="listbox"
                className={
                  isLanguageOpen ? "language-trigger open" : "language-trigger"
                }
                disabled={isBusy}
                onClick={() => {
                  if (isBusy) return;
                  setIsLanguageOpen((value) => !value);
                }}
                type="button"
              >
                <span>
                  <small>输出语言</small>
                  <strong>{selectedLanguageOption.label}</strong>
                </span>
                <i aria-hidden="true" />
              </button>
              {isLanguageOpen ? (
                <div className="language-menu" role="listbox">
                  {LANGUAGE_OPTIONS.map((option) => (
                    <button
                      aria-selected={languagePreference === option.value}
                      className={
                        languagePreference === option.value
                          ? "language-option selected"
                          : "language-option"
                      }
                      key={option.value}
                      disabled={isBusy}
                      onClick={() => {
                        if (isBusy) return;
                        if (option.value === "traditional") {
                          setIsLanguageOpen(false);
                          setIsTraditionalNoticeOpen(true);
                          return;
                        }
                        setLanguagePreference(option.value);
                        setIsLanguageOpen(false);
                      }}
                      role="option"
                      type="button"
                    >
                      <strong>{option.label}</strong>
                      <span>{option.description}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <textarea
            maxLength={1500}
            disabled={isBusy}
            onChange={(event) => setText(event.target.value)}
            placeholder={EMPTY_TEXT}
            value={text}
          />

          <div className="panel-footer">
            <span className={text.length > 1500 ? "count over" : "count"}>
              {text.length} / 1500
            </span>
            <div className="actions">
              <button
                className="secondary"
                disabled={isBusy}
                onClick={() => {
                  if (isBusy) return;
                  setText("");
                  setCheckResult(null);
                  setRewriteResult(null);
                  setCopyStatus("");
                  setError("");
                }}
                type="button"
              >
                全部清空
              </button>
              <button
                className="primary"
                disabled={!canCheck || isBusy}
                onClick={handleCheck}
                type="button"
              >
                {isChecking ? "检测中..." : "立即检测"}
              </button>
            </div>
          </div>
        </div>

        <div className="panel result-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">检测结果</p>
              <h2>{checkResult ? riskTitle(checkResult.summary.riskLevel) : "等待检测"}</h2>
            </div>
            <button
              className="primary"
              disabled={!checkResult || isBusy}
              onClick={handleRewrite}
              type="button"
            >
              {isRewriting ? "改写中..." : "一键改写"}
            </button>
          </div>

          <div className="result-footer">
            <span>全文：{checkResult?.summary.totalChars ?? 0} 字</span>
            <span>
              违禁词：
              <strong className="danger">
                {checkResult?.summary.violationCount ?? 0}
              </strong>
              字
            </span>
            <span>
              敏感词：
              <strong className="warning">
                {checkResult?.summary.sensitiveCount ?? 0}
              </strong>
              字
            </span>
          </div>

          <div className="result-body">
            <article className="text-preview" aria-label="原文高亮结果">
              {checkResult ? (
                <HighlightedText
                  matches={checkResult.matches}
                  text={checkResult.originalText}
                />
              ) : (
                <p className="empty-state">检测后将在这里展示原文与风险高亮。</p>
              )}
            </article>

            <aside className="annotation-list" aria-label="质检批注建议">
              {activeAnnotations.length > 0 ? (
                activeAnnotations.map((annotation, index) => {
                  const match = matchedById.get(annotation.matchId);
                  return (
                    <AnnotationCard
                      annotation={annotation}
                      index={index}
                      key={`${annotation.matchId}-${index}`}
                      match={match}
                    />
                  );
                })
              ) : (
                <p className="empty-state compact">暂无批注建议。</p>
              )}
            </aside>
          </div>

        </div>
      </section>

      {rewriteResult ? (
        <section className="rewrite-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">一键改写</p>
              <h2>优化稿</h2>
            </div>
            <div className="rewrite-actions">
              <span className={`risk-badge ${rewriteResult.remainingRisk.riskLevel}`}>
                剩余风险：{riskTitle(rewriteResult.remainingRisk.riskLevel)}
              </span>
              <button
                className="secondary compact"
                disabled={isBusy}
                onClick={handleCopyRewrite}
                type="button"
              >
                复制文案
              </button>
            </div>
          </div>
          {copyStatus ? <p className="copy-status">{copyStatus}</p> : null}
          <p className="rewritten-text">{rewriteResult.rewrittenText}</p>
          <div className="change-list">
            {rewriteResult.changeSummary.map((change, index) => (
              <div className="change-item" key={`${change.before}-${index}`}>
                <strong>{change.before}</strong>
                <span>{change.after}</span>
                <em>{change.reason}</em>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {error ? <p className="error-banner">{error}</p> : null}

      {isTraditionalNoticeOpen ? (
        <div
          aria-labelledby="traditional-notice-title"
          aria-modal="true"
          className="modal-backdrop"
          role="dialog"
        >
          <div className="modal-card">
            <div>
              <p className="eyebrow">输出语言</p>
              <h2 id="traditional-notice-title">繁体优化暂未支持</h2>
            </div>
            <p>当前版本仅支持简体优化稿，繁体优化能力将在后续版本开放。</p>
            <button
              className="primary"
              onClick={() => setIsTraditionalNoticeOpen(false)}
              type="button"
            >
              我知道了
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}

async function copyTextToClipboard(text: string) {
  let clipboardError: unknown;

  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (error) {
      clipboardError = error;
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "0";
  textarea.style.width = "1px";
  textarea.style.height = "1px";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.focus({ preventScroll: true });
  textarea.select();
  textarea.setSelectionRange(0, text.length);

  try {
    if (!document.execCommand("copy")) {
      throw clipboardError instanceof Error
        ? clipboardError
        : new Error("copy command failed");
    }
  } finally {
    document.body.removeChild(textarea);
  }
}

function HighlightedText({
  matches,
  text
}: {
  matches: MatchResult[];
  text: string;
}) {
  if (matches.length === 0) {
    return <p>{text}</p>;
  }

  const parts: React.ReactNode[] = [];
  let cursor = 0;

  for (const match of matches) {
    if (match.start > cursor) {
      parts.push(text.slice(cursor, match.start));
    }
    parts.push(
      <mark className={`hit ${match.severity}`} key={match.id}>
        {text.slice(match.start, match.end)}
      </mark>
    );
    cursor = match.end;
  }

  if (cursor < text.length) {
    parts.push(text.slice(cursor));
  }

  return <p>{parts}</p>;
}

function AnnotationCard({
  annotation,
  index,
  match
}: {
  annotation: Annotation;
  index: number;
  match?: MatchResult;
}) {
  const severity = match?.severity ?? annotation.riskLevel ?? "medium";
  return (
    <article className={`annotation-card ${severity}`}>
      <div className="annotation-meta">
        <span>批注 {index + 1}</span>
        {match ? <strong>{match.term}</strong> : null}
      </div>
      <h3>{annotation.title}</h3>
      <p>{annotation.reason}</p>
      <p>{annotation.suggestion}</p>
      {annotation.alternatives.length > 0 ? (
        <div className="alternatives">
          {annotation.alternatives.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function riskTitle(level: "low" | "medium" | "high") {
  const titles = {
    low: "低风险",
    medium: "中风险",
    high: "高风险"
  };
  return titles[level];
}
