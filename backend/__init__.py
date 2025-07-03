# backend/__init__.py

from flask import Flask

def create_app():
    app = Flask(__name__)

    # Load config if you have config.py
    app.config.from_object('backend.config.Config')

    # Import and register routes or blueprints here
    from backend import app_routes
    app.register_blueprint(app_routes.bp)

    return app
