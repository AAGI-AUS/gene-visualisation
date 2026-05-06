#!./env/bin/python
import re

from bs4 import BeautifulSoup

built = "./build/index.html"
with open(built, "r") as f:
    soup = BeautifulSoup(f, "html.parser")

tags = soup.prettify().split("\n")
touched_up = ""

after_body = False
script_added = False
scripts = ""
for tag in tags:
    if not after_body:
        if re.match(r" *</*script.*>", tag):
            scripts += tag
            continue

        if re.match(r" *</body>", tag):
            after_body = True
    elif not script_added:
        touched_up += scripts
        script_added = True
    touched_up += tag

with open(built, "w") as f:
    f.write(touched_up)
