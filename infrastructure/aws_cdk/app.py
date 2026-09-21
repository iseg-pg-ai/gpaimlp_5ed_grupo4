#!/usr/bin/env python3
import aws_cdk as cdk
from stack import BluAiStack

app = cdk.App()
BluAiStack(app, "BluAiStack")
app.synth()
