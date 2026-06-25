"""
LLM Advisor — calls OpenAI GPT-4o with scenario RL results
and returns a structured recommendation report.

Falls back gracefully if OPENAI_API_KEY is not set.
"""
from __future__ import annotations

import json
import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)

_API_KEY = os.getenv("OPENAI_API_KEY", "").strip()


def _format_kpi_table(scenarios: list[dict]) -> str:
    """Build a markdown-like table of scenario KPIs for the LLM prompt."""
    lines = ["| Scenario | Type | Avg Wait (s) | Throughput (vph) | Flow Efficiency |",
             "|----------|------|-------------|-----------------|----------------|"]
    for s in scenarios:
        kpi = s.get("kpi") or {}
        lines.append(
            f"| {s['label']} | {s['scenario_type']} "
            f"| {kpi.get('avg_wait_s', 'N/A')} "
            f"| {kpi.get('throughput_vph', 'N/A')} "
            f"| {kpi.get('flow_efficiency', 'N/A')} |"
        )
    return "\n".join(lines)


def _build_prompt(intersection_name: str, scenarios: list[dict]) -> str:
    table = _format_kpi_table(scenarios)
    scenario_count = len(scenarios)
    baseline = next((s for s in scenarios if s["scenario_type"] == "baseline"), None)

    baseline_block = ""
    if baseline and baseline.get("kpi"):
        b = baseline["kpi"]
        baseline_block = (
            f"\nBaseline (current state): avg_wait={b.get('avg_wait_s')}s, "
            f"throughput={b.get('throughput_vph')} vph, "
            f"flow_efficiency={b.get('flow_efficiency')}"
        )

    return f"""You are an expert traffic engineering AI assistant analyzing signal optimization simulation results for {intersection_name}.

{scenario_count} road modification scenarios were tested under simulation. Each scenario ran the same traffic demand through the intersection with the stated structural change, and the signal controller optimized signal timing for each.
{baseline_block}

## Simulation Results

{table}

## Your Task

Provide a detailed, structured traffic engineering recommendation report. For EACH scenario:
1. Explain what the result means in plain language for a city traffic engineer
2. Quantify the improvement or degradation vs baseline (% change in wait time, throughput)
3. List real-world implementation considerations (cost, safety, construction disruption)
4. Give a feasibility rating: Easy / Moderate / Complex / Not Recommended

Then provide an OVERALL RECOMMENDATION:
- Which single change gives the best traffic outcome?
- Which change gives the best cost-benefit ratio?
- If you could only implement one change, which would it be and why?

## Output Format

Respond ONLY with a valid JSON object matching this structure (no markdown, no code blocks):

{{
  "intersection": "{intersection_name}",
  "summary": "2-3 sentence executive summary of the analysis",
  "ranked_scenarios": [
    {{
      "rank": 1,
      "scenario_id": "...",
      "label": "...",
      "scenario_type": "...",
      "headline": "One-line verdict",
      "analysis": "2-4 sentences of detailed analysis",
      "vs_baseline_wait_pct": -15.2,
      "vs_baseline_throughput_pct": 12.4,
      "implementation_notes": "Real-world considerations",
      "feasibility": "Easy|Moderate|Complex|Not Recommended",
      "recommendation_strength": "Strongly Recommended|Recommended|Neutral|Not Recommended"
    }}
  ],
  "top_recommendation": {{
    "label": "Best overall change",
    "reason": "Why this is the top pick",
    "estimated_benefit": "Quantified expected improvement"
  }},
  "best_cost_benefit": {{
    "label": "Best cost-benefit change",
    "reason": "Why"
  }},
  "caveats": ["List of important caveats or data limitations"]
}}"""


def get_llm_recommendation(
    intersection_name: str,
    scenarios: list[dict],
    model: str = "gpt-4o",
) -> dict:
    """
    Call selected LLM (OpenAI, Claude, or Groq) with scenario results and return parsed recommendation dict.

    Returns:
        dict with keys: success, data (if success), error (if not success), key_missing
    """
    import os
    import json
    import requests

    # 1. Determine provider and key
    model_lower = model.lower()
    if model_lower.startswith("claude-"):
        # Access should be through Bedrock (AWS credentials or Token)
        aws_auth_mode = os.getenv("AWS_AUTH_MODE", "").strip().upper()
        aws_token = os.getenv("AWS_BEARER_TOKEN_BEDROCK", "").strip()
        aws_access_key = os.getenv("AWS_ACCESS_KEY_ID", "").strip()
        aws_secret_key = os.getenv("AWS_SECRET_ACCESS_KEY", "").strip()
        
        has_aws_token = (aws_auth_mode == "TOKEN" and bool(aws_token))
        has_aws_keys = bool(aws_access_key and aws_secret_key)
        has_aws_config = os.path.exists(os.path.expanduser("~/.aws/credentials")) or os.path.exists(os.path.expanduser("~/.aws/config"))
        has_aws = has_aws_token or has_aws_keys or has_aws_config
        
        if has_aws:
            provider = "Bedrock"
            key_name = "AWS Bedrock Token" if has_aws_token else "AWS credentials"
            api_key = "aws-configured"
        else:
            api_key = os.getenv("ANTHROPIC_API_KEY", "").strip()
            if api_key:
                provider = "Anthropic"
                key_name = "ANTHROPIC_API_KEY"
            else:
                provider = "Bedrock"
                key_name = "AWS credentials"
                api_key = ""
    elif "llama" in model_lower or "mixtral" in model_lower:
        provider = "Groq"
        key_name = "GROQ_API_KEY"
        api_key = os.getenv("GROQ_API_KEY", "").strip()
    else:
        provider = "OpenAI"
        key_name = "OPENAI_API_KEY"
        api_key = os.getenv("OPENAI_API_KEY", "").strip()

    if not api_key:
        logger.warning("%s not set — returning template recommendation", key_name)
        return {
            "success": False,
            "key_missing": True,
            "error": f"{key_name} is not configured. Set it in your .env file to enable {provider} AI recommendations.",
            "data": _template_recommendation(intersection_name, scenarios),
        }

    prompt = _build_prompt(intersection_name, scenarios)
    system_prompt = (
        "You are a senior traffic engineering AI that analyzes signal optimization simulation results "
        "and provides actionable, quantified infrastructure recommendations. "
        "Always respond with valid JSON only."
    )

    try:
        if provider == "OpenAI":
            try:
                from openai import OpenAI
                client = OpenAI(api_key=api_key)
                response = client.chat.completions.create(
                    model=model,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": prompt},
                    ],
                    temperature=0.3,
                    max_tokens=2000,
                    response_format={"type": "json_object"},
                )
                raw = response.choices[0].message.content or "{}"
                data = json.loads(raw)
                return {"success": True, "key_missing": False, "data": data}
            except ImportError:
                return {
                    "success": False,
                    "key_missing": False,
                    "error": "openai Python package not installed. Run: pip install openai",
                    "data": _template_recommendation(intersection_name, scenarios),
                }

        elif provider == "Groq":
            url = "https://api.groq.com/openai/v1/chat/completions"
            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json"
            }
            payload = {
                "model": model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt}
                ],
                "temperature": 0.3,
                "max_tokens": 2000,
                "response_format": {"type": "json_object"}
            }
            res = requests.post(url, json=payload, headers=headers, timeout=30)
            res.raise_for_status()
            res_data = res.json()
            raw = res_data["choices"][0]["message"]["content"] or "{}"
            data = json.loads(raw)
            return {"success": True, "key_missing": False, "data": data}

        elif provider == "Bedrock":
            try:
                import boto3
                region = os.getenv("AWS_DEFAULT_REGION", os.getenv("AWS_REGION", "us-east-1"))
                endpoint_url = os.getenv("AWS_BEDROCK_ENDPOINT_URL", os.getenv("AWS_ENDPOINT_URL", "")).strip() or None
                
                aws_auth_mode = os.getenv("AWS_AUTH_MODE", "").strip().upper()
                aws_token = os.getenv("AWS_BEARER_TOKEN_BEDROCK", "").strip()
                aws_access_key = os.getenv("AWS_ACCESS_KEY_ID", "").strip()
                aws_secret_key = os.getenv("AWS_SECRET_ACCESS_KEY", "").strip()
                aws_session_token = os.getenv("AWS_SESSION_TOKEN", "").strip()
                
                if aws_auth_mode == "TOKEN" and aws_token:
                    # Explicitly set environment variable so boto3's client picks it up
                    os.environ["AWS_BEARER_TOKEN_BEDROCK"] = aws_token
                    client = boto3.client(
                        "bedrock-runtime",
                        region_name=region,
                        endpoint_url=endpoint_url
                    )
                elif aws_access_key and aws_secret_key:
                    if aws_session_token:
                        client = boto3.client(
                            "bedrock-runtime",
                            region_name=region,
                            aws_access_key_id=aws_access_key,
                            aws_secret_access_key=aws_secret_key,
                            aws_session_token=aws_session_token,
                            endpoint_url=endpoint_url
                        )
                    else:
                        client = boto3.client(
                            "bedrock-runtime",
                            region_name=region,
                            aws_access_key_id=aws_access_key,
                            aws_secret_access_key=aws_secret_key,
                            endpoint_url=endpoint_url
                        )
                else:
                    client = boto3.client(
                        "bedrock-runtime",
                        region_name=region,
                        endpoint_url=endpoint_url
                    )
                
                # Ordered list of candidate model IDs — newest first, fallback to older
                # Using global/cross-region/regional formats for active routing in June 2026
                if "fable" in model_lower or "claude-5" in model_lower:
                    model_candidates = [
                        "global.anthropic.claude-fable-5",                 # Claude Fable 5 (Global)
                        "us.anthropic.claude-fable-5",                     # Claude Fable 5 (US)
                        "anthropic.claude-fable-5",                        # Claude Fable 5 (Regional)
                        "global.anthropic.claude-sonnet-4-6",               # Fallback to Sonnet 4.6
                        "anthropic.claude-sonnet-4-6",
                    ]
                elif "sonnet" in model_lower or "claude-4" in model_lower:
                    model_candidates = [
                        "global.anthropic.claude-sonnet-4-6",               # Claude Sonnet 4.6 (Global)
                        "us.anthropic.claude-sonnet-4-6",                   # Claude Sonnet 4.6 (US)
                        "anthropic.claude-sonnet-4-6",                      # Claude Sonnet 4.6 (Regional)
                        "global.anthropic.claude-fable-5",                 # Claude Fable 5
                        "anthropic.claude-fable-5",
                    ]
                else:
                    model_candidates = [
                        "global.anthropic.claude-haiku-4-5-20251001-v1:0",  # Claude Haiku 4.5 (Global)
                        "us.anthropic.claude-haiku-4-5-20251001-v1:0",      # Claude Haiku 4.5 (US)
                        "anthropic.claude-haiku-4-5-20251001-v1:0",         # Claude Haiku 4.5 (Regional)
                        "global.anthropic.claude-sonnet-4-6",               # Claude Sonnet 4.6 fallback
                        "anthropic.claude-sonnet-4-6",
                    ]

                raw = None
                last_error = None
                for model_id in model_candidates:
                    try:
                        logger.info("Trying Bedrock model: %s", model_id)
                        try:
                            response = client.converse(
                                modelId=model_id,
                                messages=[{"role": "user", "content": [{"text": prompt}]}],
                                system=[{"text": system_prompt}],
                                inferenceConfig={"temperature": 0.3, "maxTokens": 2000}
                            )
                            raw = response["output"]["message"]["content"][0]["text"] or "{}"
                        except AttributeError:
                            # Fallback to invoke_model for older boto3 versions
                            body = json.dumps({
                                "anthropic_version": "bedrock-2023-05-31",
                                "max_tokens": 2000,
                                "system": system_prompt,
                                "messages": [{"role": "user", "content": prompt}],
                                "temperature": 0.3
                            })
                            response = client.invoke_model(modelId=model_id, body=body)
                            response_body = json.loads(response.get("body").read())
                            raw = response_body.get("content")[0].get("text") or "{}"
                        break  # Success — stop trying other candidates
                    except Exception as model_err:
                        err_str = str(model_err)
                        if "ResourceNotFoundException" in err_str or "AccessDeniedException" in err_str or "end of" in err_str.lower() or "Legacy" in err_str or "legacy" in err_str or "not authorized" in err_str:
                            logger.warning("Model %s unavailable (%s), trying next candidate...", model_id, err_str[:80])
                            last_error = model_err
                            continue  # Try the next model in the list
                        raise  # Re-raise non-model-availability errors immediately

                if raw is None:
                    raise last_error or Exception("All Bedrock model candidates failed")

                # Parse JSON response
                raw_clean = raw.strip()
                if raw_clean.startswith("```json"):
                    raw_clean = raw_clean[7:]
                elif raw_clean.startswith("```"):
                    raw_clean = raw_clean[3:]
                if raw_clean.endswith("```"):
                    raw_clean = raw_clean[:-3]
                data = json.loads(raw_clean.strip())
                return {"success": True, "key_missing": False, "data": data}
                
            except ImportError:
                return {
                    "success": False,
                    "key_missing": False,
                    "error": "boto3 package not installed. Run: pip install boto3",
                    "data": _template_recommendation(intersection_name, scenarios),
                }

        elif provider == "Anthropic":
            url = "https://api.anthropic.com/v1/messages"
            headers = {
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json"
            }
            claude_prompt = f"{prompt}\n\nIMPORTANT: Respond ONLY with a valid JSON object matching the requested schema. Do not output any markdown or explanation blocks."
            payload = {
                "model": model,
                "max_tokens": 2000,
                "system": system_prompt,
                "messages": [
                    {"role": "user", "content": claude_prompt}
                ],
                "temperature": 0.3
            }
            res = requests.post(url, json=payload, headers=headers, timeout=30)
            res.raise_for_status()
            res_data = res.json()
            raw = res_data["content"][0]["text"] or "{}"
            # Extract JSON in case Claude wraps it in codeblocks
            raw_clean = raw.strip()
            if raw_clean.startswith("```json"):
                raw_clean = raw_clean[7:]
            elif raw_clean.startswith("```"):
                raw_clean = raw_clean[3:]
            if raw_clean.endswith("```"):
                raw_clean = raw_clean[:-3]
            data = json.loads(raw_clean.strip())
            return {"success": True, "key_missing": False, "data": data}

    except json.JSONDecodeError as e:
        logger.error("LLM returned invalid JSON: %s", e)
        return {"success": False, "key_missing": False,
                "error": f"LLM returned invalid JSON: {e}",
                "data": _template_recommendation(intersection_name, scenarios)}
    except Exception as e:
        logger.error("%s API error: %s", provider, e)
        err_str = str(e)
        is_key_missing = False
        if provider == "Bedrock":
            # If it's a Bedrock API error due to authorization/access or legacy retirement, flag it as key_missing
            # and provide user-friendly descriptive troubleshooting instructions.
            if any(term in err_str for term in ["AccessDeniedException", "ResourceNotFoundException", "Access denied", "not authorized", "end of its life"]):
                is_key_missing = True
                if "AccessDeniedException" in err_str or "not authorized" in err_str:
                    err_str = (
                        "AWS Bedrock Model Access Denied: The IAM credentials or API token "
                        "do not have permission to invoke the requested Claude model. "
                        "Please: 1. Go to the AWS Bedrock Console -> 'Model access', and enable access for "
                        "'Claude Fable 5', 'Claude Sonnet 4.6', and 'Claude Haiku 4.5'. "
                        "2. Ensure your IAM user/role has 'bedrock:InvokeModel' permission for these active model resources. "
                        "Alternative: Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GROQ_API_KEY in your .env to switch providers."
                    )
                elif "ResourceNotFoundException" in err_str or "end of its life" in err_str:
                    err_str = (
                        "AWS Bedrock Model EOL/NotFound: All candidate Claude models returned 'End of Life' or were not found. "
                        "Please go to the AWS Bedrock Console and request access to the latest active Claude models "
                        "(Claude Fable 5, Claude Sonnet 4.6, or Claude Haiku 4.5). "
                        "Alternative: Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or GROQ_API_KEY in your .env to switch providers."
                    )
        return {"success": False, "key_missing": is_key_missing,
                "error": err_str,
                "data": _template_recommendation(intersection_name, scenarios)}


def _template_recommendation(intersection_name: str, scenarios: list[dict]) -> dict:
    """
    Generate a heuristic-based recommendation when LLM is unavailable.
    Uses raw KPI numbers to rank scenarios without GPT.
    """
    baseline = next((s for s in scenarios if s["scenario_type"] == "baseline"), None)
    baseline_wait = (baseline or {}).get("kpi", {}).get("avg_wait_s", 0) if baseline else 0
    baseline_throughput = (baseline or {}).get("kpi", {}).get("throughput_vph", 0) if baseline else 0

    ranked = []
    for s in scenarios:
        if s["scenario_type"] == "baseline":
            continue
        kpi = s.get("kpi") or {}
        wait = kpi.get("avg_wait_s", baseline_wait)
        tput = kpi.get("throughput_vph", baseline_throughput)

        wait_delta = ((wait - baseline_wait) / max(baseline_wait, 1)) * 100 if baseline_wait else 0
        tput_delta = ((tput - baseline_throughput) / max(baseline_throughput, 1)) * 100 if baseline_throughput else 0

        score = -wait_delta + tput_delta   # lower wait = better, higher throughput = better
        ranked.append({
            "scenario_id": s["scenario_id"],
            "label": s["label"],
            "scenario_type": s["scenario_type"],
            "score": score,
            "wait_delta": wait_delta,
            "tput_delta": tput_delta,
        })

    ranked.sort(key=lambda x: x["score"], reverse=True)

    ranked_scenarios = []
    for i, r in enumerate(ranked):
        feasibility_map = {
            "free_left": "Moderate",
            "u_turn_mid": "Moderate",
            "extra_arm": "Complex",
            "remove_lane": "Easy",
            "phase_change": "Easy",
            "add_pedestrian": "Easy",
            "remove_pedestrian": "Easy",
        }
        strength = "Strongly Recommended" if r["score"] > 10 else (
            "Recommended" if r["score"] > 0 else "Not Recommended"
        )
        ranked_scenarios.append({
            "rank": i + 1,
            "scenario_id": r["scenario_id"],
            "label": r["label"],
            "scenario_type": r["scenario_type"],
            "headline": f"{r['label']}: {abs(r['wait_delta']):.1f}% {'improvement' if r['wait_delta'] < 0 else 'degradation'} in wait time",
            "analysis": (
                f"Traffic simulation shows {abs(r['wait_delta']):.1f}% {'reduction' if r['wait_delta'] < 0 else 'increase'} "
                f"in average wait time and {abs(r['tput_delta']):.1f}% "
                f"{'increase' if r['tput_delta'] > 0 else 'decrease'} in throughput vs baseline. "
                f"This scenario scored {r['score']:.1f} on the composite performance index."
            ),
            "vs_baseline_wait_pct": round(r["wait_delta"], 1),
            "vs_baseline_throughput_pct": round(r["tput_delta"], 1),
            "implementation_notes": f"Standard {feasibility_map.get(r['scenario_type'], 'Moderate')} implementation required.",
            "feasibility": feasibility_map.get(r["scenario_type"], "Moderate"),
            "recommendation_strength": strength,
        })

    top = ranked[0] if ranked else None
    return {
        "intersection": intersection_name,
        "summary": (
            f"Heuristic analysis of {len(scenarios)} scenarios at {intersection_name}. "
            f"{'Top performer: ' + top['label'] if top else 'No completed scenarios to compare.'} "
            "Configure your OpenAI API key for detailed AI-generated insights."
        ),
        "ranked_scenarios": ranked_scenarios,
        "top_recommendation": {
            "label": top["label"] if top else "N/A",
            "reason": f"Best composite score ({top['score']:.1f}) based on wait time + throughput improvement" if top else "Insufficient data",
            "estimated_benefit": f"{abs(top['wait_delta']):.1f}% wait time improvement" if top else "N/A",
        } if top else {"label": "N/A", "reason": "No scenarios completed", "estimated_benefit": "N/A"},
        "best_cost_benefit": {
            "label": next((r["label"] for r in ranked if r["scenario_type"] in ("phase_change", "remove_lane", "free_left")), top["label"] if top else "N/A"),
            "reason": "Low implementation cost with measurable improvement",
        },
        "caveats": [
            "Results are from fast mock traffic simulation — run Full mode for higher accuracy",
            "Real-world results may vary due to pedestrian behavior, weather, and incidents",
            "Set OPENAI_API_KEY for detailed AI-generated engineering analysis",
        ],
        "llm_used": False,
    }
