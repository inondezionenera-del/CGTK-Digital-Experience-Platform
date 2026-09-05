import logging
import sys


def configure_logging(debug: bool) -> None:
    """Configure root logging once at process startup.

    Deliberately plain (stdlib logging, stdout, no external log
    infrastructure) per the "no premature infrastructure" constraint.
    """
    level = logging.DEBUG if debug else logging.INFO
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(
        logging.Formatter("%(asctime)s %(levelname)s %(name)s :: %(message)s")
    )

    root = logging.getLogger()
    root.setLevel(level)
    root.handlers = [handler]

    # Quiet noisy third-party loggers unless we're actually debugging.
    if not debug:
        logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
