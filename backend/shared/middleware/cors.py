from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI


def setup_cors(app: FastAPI, origins: list, allow_credentials: bool, allow_methods: list, allow_headers: list) -> None:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=allow_credentials,
        allow_methods=allow_methods,
        allow_headers=allow_headers,
    )