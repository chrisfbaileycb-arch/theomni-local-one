"""Shared test config: the persistence tests intentionally restart the backend via
supervisorctl mid-suite; with xdist parallel workers the other worker sees transient
502/503 from the ingress. Mount retries on every Session so tests ride out restarts."""
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

_orig_init = requests.Session.__init__


def _patched_init(self, *args, **kwargs):
    _orig_init(self, *args, **kwargs)
    retry = Retry(total=6, backoff_factor=0.5, status_forcelist=[423, 502, 503, 504],
                  allowed_methods=None, raise_on_status=False)
    adapter = HTTPAdapter(max_retries=retry)
    self.mount("http://", adapter)
    self.mount("https://", adapter)


requests.Session.__init__ = _patched_init
