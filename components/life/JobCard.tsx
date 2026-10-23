"use client";
import { ArrowUpRight, Bookmark, Check, ShieldCheck } from "lucide-react";
import {formatJobTimestamp,observedJobDelay} from "@/lib/job-time";
import type { Job } from "@/lib/jobs";

const levelLabel = { internship: "Internship", entry: "New grad / entry", other: "Other experience" };
const groupLabels = { big: "Fortune 500 & big names", growth: "YC & established", startup: "Smaller startups / other" };

const ago = (value: string) => { const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 60000)); return minutes < 1 ? "just now" : minutes < 60 ? `${minutes}m ago` : minutes < 1440 ? `${Math.floor(minutes / 60)}h ago` : `${Math.floor(minutes / 1440)}d ago`; };

export default function JobCard({ job, sourceName, saving, action }: { job: Job; sourceName: (id: string) => string; saving: boolean; action: (body: unknown, id: string) => Promise<boolean> }) {
  const delay=observedJobDelay(job);
  const confirmed = job.dateStatus === "confirmed";
  return <article className={`j-card ${job.applied ? "j-card-applied" : ""}`}>
    <div className="j-company-icon" aria-hidden="true">{job.company.slice(0, 1)}</div>
    <div className="j-card-main">
      <div className="j-company-line"><span>{job.company}</span>{job.unavailable && <small>Not in the latest feed</small>}{job.applied && <small><Check size={11}/>Applied</small>}</div>
      <h3><a href={job.url} target="_blank" rel="noreferrer">{job.title}<ArrowUpRight size={13}/></a></h3>
      <p>{job.location}</p>
      <div className="j-tags">{job.sources.some(id=>/^(greenhouse|lever|ashby):/.test(id))&&<span>Employer feed</span>}<span>{levelLabel[job.level]}</span>{job.remote && <span>Remote listed</span>}{job.sources.map(id => <span key={id}>{sourceName(id)}</span>)}</div>
      <div className="j-dates">
        {job.postedAt ? <span className={confirmed ? "j-confirmed-date" : ""} title={`${job.postedAt}${job.postedPrecision === "day" ? " · calendar date only; time not supplied" : ""}`}>{confirmed && <ShieldCheck size={11}/>}<strong>{confirmed ? "Confirmed posted" : "Source posted"}</strong> <time dateTime={job.postedAt}>{formatJobTimestamp(job.postedAt,job.postedPrecision)}</time>{job.postedPrecision==="day"&&<small> · time unavailable</small>}</span> : <span>{job.sourceDate ? `Source age/date: ${job.sourceDate} · unconfirmed` : "Posting date unavailable"}</span>}
        <span title={formatJobTimestamp(job.firstSeenAt)}>{job.baseline ? "First imported" : "Detected"} {ago(job.firstSeenAt)}</span>
        {delay&&<span title="Time between the source-reported posting timestamp and V.E.C.T.O.R.’s first observation; not a guaranteed polling delay.">Detected {delay} after source time</span>}
      </div>
      <details className="j-evidence"><summary>{job.matchStatus === "matched" ? `Verified job match · ${job.verifiedSources?.length || job.sources.length} sources` : "Source & date details"}</summary><div><p><strong>First seen in V.E.C.T.O.R.:</strong> {formatJobTimestamp(job.firstSeenAt)}{job.baseline?" · initial import, not a new-post alert":""}</p><p>{job.matchReason || "Cross-source verification is pending."}</p>{!!job.possibleMatches && <p>{job.possibleMatches} similar {job.possibleMatches === 1 ? "role remains" : "roles remain"} separate: no shared requisition or application link.</p>}{!!job.dateEvidence?.length && <ul>{job.dateEvidence.map((item, index) => <li key={`${item.source}:${index}`}><a href={item.url} target="_blank" rel="noreferrer">{sourceName(item.source)}<ArrowUpRight size={10}/></a><span>{formatJobTimestamp(item.date, item.precision)}{item.kind === "estimated" ? " · estimated; excluded from confirmed date" : item.yearInferred ? " · source day; year inferred" : item.precision === "day" ? " · date only" : " · source timestamp"}</span></li>)}</ul>}<p>Confirmed dates use a verified job match and explicit date evidence from an employer feed or two reporting sources. The oldest source-supplied date is kept; detection times and age estimates are excluded. This does not prove the first-ever publication anywhere.</p></div></details>
      <details className="j-company-group-control"><summary>{job.companyGroupReason || "Company group"}</summary><div><label>Company group<select aria-label={`Company group for ${job.company}`} value={job.companyGroupOverride || "auto"} disabled={saving} onChange={event => action({ action: "company_group", company: job.company, group: event.target.value }, job.id)}><option value="auto">Automatic grouping</option>{Object.entries(groupLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>{job.companyGroupSource && <a href={job.companyGroupSource} target="_blank" rel="noreferrer">Company reference<ArrowUpRight size={11}/></a>}</div></details>
    </div>
    <div className="j-card-actions">
      <button className={`j-save ${job.saved ? "j-is-saved" : ""}`} aria-label={`${job.saved ? "Unsave" : "Save"} ${job.title}`} aria-pressed={!!job.saved} disabled={saving} onClick={() => action({ action: "progress", id: job.id, saved: !job.saved }, job.id)}><Bookmark size={16} fill={job.saved ? "currentColor" : "none"}/></button>
      <a className="l-button l-secondary" href={job.url} target="_blank" rel="noreferrer">View role<ArrowUpRight size={12}/></a>
      <label className="j-applied-check"><input type="checkbox" checked={!!job.applied} disabled={saving} aria-label={`Applied to ${job.title} at ${job.company}`} onChange={event => action({ action: "progress", id: job.id, applied: event.target.checked }, job.id)}/><span>Applied</span></label>
      <button className="j-hide" disabled={saving} onClick={() => action({ action: "progress", id: job.id, hidden: true }, job.id)}>Hide</button>
    </div>
  </article>;
}
