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
    lines = ["| Scenario | Type | Avg Wait (s) | Throughput (vph) | Flow Efficiency | Episode Reward |",
             "|----------|------|-------------|-----------------|----------------|----------------|"]
    for s in scenarios:
        kpi = s.get("kpi") or {}
        lines.append(
            f"| {s['label']} | {s['scenario_type']} "
            f"| {kpi.get('avg_wait_s', 'N/A')} "
            f"| {kpi.get('throughput_vph', 'N/A')} "
            f"| {kpi.get('flow_efficiency', 'N/A')} "
            f"| {kpi.get('episode_reward', 'N/A')} |"
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

    return f"""You are an expert traffic engineering AI assistant analyzing RL simulation results for {intersection_name}.

{scenario_count} road modification scenarios were tested using Reinforcement Learning. Each scenario ran the same traffic demand through the intersection with the stated structural change, and the RL agent was trained to optimise signal timing for each.
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
        # Access should be through Bedrock (AWS credentials)
        aws_access_key = os.getenv("AWS_ACCESS_KEY_ID", "").strip()
        aws_secret_key = os.getenv("AWS_SECRET_ACCESS_KEY", "").strip()
        has_aws = bool(aws_access_key and aws_secret_key) or os.path.exists(os.path.expanduser("~/.aws/credentials")) or os.path.exists(os.path.expanduser("~/.aws/config"))
        
        if has_aws:
            provider = "Bedrock"
            key_name = "AWS credentials"
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
        "You are a senior traffic engineering AI that analyzes RL simulation results "
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
                
                aws_access_key = os.getenv("AWS_ACCESS_KEY_ID", "").strip()
                aws_secret_key = os.getenv("AWS_SECRET_ACCESS_KEY", "").strip()
                aws_session_token = os.getenv("AWS_SESSION_TOKEN", "").strip()
                
                if aws_access_key and aws_secret_key:
                    if aws_session_token:
                        client = boto3.client(
                            "bedrock-runtime",
                            region_name=region,
                            aws_access_key_id=aws_access_key,
                            aws_secret_access_key=aws_secret_key,
                            aws_session_token=aws_session_token
                        )
                    else:
                        client = boto3.client(
                            "bedrock-runtime",
                            region_name=region,
                            aws_access_key_id=aws_access_key,
                            aws_secret_access_key=aws_secret_key
                        )
                else:
                    client = boto3.client("bedrock-runtime", region_name=region)
                
                # Determine Bedrock Model ID
                model_id = "anthropic.claude-3-haiku-20240307-v1:0"
                if "sonnet" in model_lower:
                    model_id = "anthropic.claude-3-5-sonnet-20240620-v1:0"
                
                # Try Converse API first
                try:
                    response = client.converse(
                        modelId=model_id,
                        messages=[
                            {
                                "role": "user",
                                "content": [{"text": prompt}]
                            }
                        ],
                        system=[{"text": system_prompt}],
                        inferenceConfig={
                            "temperature": 0.3,
                            "maxTokens": 2000
                        }
                    )
                    raw = response["output"]["message"]["content"][0]["text"] or "{}"
                except AttributeError:
                    # Fallback to invoke_model for older boto3 versions
                    body = json.dumps({
                        "anthropic_version": "bedrock-2023-05-31",
                        "max_tokens": 2000,
                        "system": system_prompt,
                        "messages": [
                            {"role": "user", "content": prompt}
                        ],
                        "temperature": 0.3
                    })
                    response = client.invoke_model(
                        modelId=model_id,
                        body=body
                    )
                    response_body = json.loads(response.get('body').read())
                    raw = response_body.get('content')[0].get('text') or "{}"
                
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
        return {"success": False, "key_missing": False,
                "error": str(e),
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
                f"RL simulation shows {abs(r['wait_delta']):.1f}% {'reduction' if r['wait_delta'] < 0 else 'increase'} "
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
            "Results are from fast mock RL simulation — run Full mode for higher accuracy",
            "Real-world results may vary due to pedestrian behavior, weather, and incidents",
            "Set OPENAI_API_KEY for detailed AI-generated engineering analysis",
        ],
        "llm_used": False,
    }
