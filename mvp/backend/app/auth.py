"""Firebase ID-token verification + Workspace-domain allow-list.

Flow: browser signs in with Google through Firebase Auth -> gets an ID token -> sends it as
`Authorization: Bearer <token>` -> we verify signature/expiry with firebase-admin and then
enforce that the e-mail belongs to an allowed Google Workspace domain (the `hd` claim is
only present for Workspace accounts, so we check both).
"""
from dataclasses import dataclass

import firebase_admin
from fastapi import Depends, HTTPException, Request
from firebase_admin import auth as fb_auth

from .config import settings

if not firebase_admin._apps:  # documented firebase-admin idiom
    firebase_admin.initialize_app(options={"projectId": settings().google_cloud_project})


@dataclass(frozen=True)
class User:
    uid: str
    email: str
    name: str
    role: str  # "builder" | "admin" (custom claim), default builder


def _bearer(request: Request) -> str:
    header = request.headers.get("authorization", "")
    if not header.lower().startswith("bearer "):
        raise HTTPException(401, "missing bearer token")
    return header.split(" ", 1)[1].strip()


def current_user(token: str = Depends(_bearer)) -> User:
    try:
        claims = fb_auth.verify_id_token(token, check_revoked=False)
    except Exception as exc:  # expired, bad signature, wrong project
        raise HTTPException(401, f"invalid token: {exc.__class__.__name__}") from exc

    email = (claims.get("email") or "").lower()
    if not email or not claims.get("email_verified", False):
        raise HTTPException(403, "verified e-mail required")

    allowed = settings().allowed_domain_list
    domain = email.rsplit("@", 1)[-1]
    hd = (claims.get("firebase", {}).get("sign_in_attributes", {}) or {}).get("hd") or claims.get("hd")
    if allowed and domain not in allowed and (hd or "").lower() not in allowed:
        raise HTTPException(403, f"domain {domain} is not allowed on this platform")

    return User(
        uid=claims["uid"],
        email=email,
        name=claims.get("name") or email,
        role=claims.get("role", "builder"),
    )


def require_admin(user: User = Depends(current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(403, "admin role required")
    return user
