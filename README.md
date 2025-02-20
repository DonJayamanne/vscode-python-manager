# Deprecated

This extension is no longer being maintained. We recommend migrating to the [Microsoft Python Environments Extension](https://marketplace.visualstudio.com/items?itemName=ms-python.vscode-python-envs) instead. Some functionalities may not be present yet, but it is under active development and being actively maintained.

> Note: The Python Environments extension requires requires the pre-release version of the Python extension (ms-python.python) to operate (version 2024.23.2025010901 or later). 

Feel free to submit new issues or feature requests on the [Microsoft Python Environments Extension repository](https://github.com/microsoft/vscode-python-environments/issues) and reference its documentation in the [README.md](https://github.com/microsoft/vscode-python-environments?tab=readme-ov-file#python-environments-and-package-manager-experimental).

# Python Environment Manager

A [Visual Studio Code](https://code.visualstudio.com/) [extension](https://marketplace.visualstudio.com/items?itemName=ms-toolsai.jupyter) that provides the ability to view and manage all of your Python environments & packages from a single place.

## Features
* Quickly change workspace Python Environments
* Viewing Environments specific to a Workspace
* Viewing all of your Python environments grouped by their type (Conda, PyEnv, etc)
* Creating a terminal with the environment activated.
* Create/delete Conda and Virtual Environments.
* Install specific versions of Python from PyEnv
* View, install, update and uninstall packages in your environments
    * Ability to search and install Conda, Poetry and Pip packages
* View outdated Conda and Pip packages
* Support for Poetry Environments
* Install Python along with Conda using [Micromamba](https://mamba.readthedocs.io/en/latest/user_guide/micromamba.html)
* Set a Python environment as the active workspace Python interpreter as used by the [Python Extension](https://marketplace.visualstudio.com/items?itemName=ms-python.python)

## Coming soon
* Improved support for Poetry
* Improved support for PipEnv


<img src=https://raw.githubusercontent.com/DonJayamanne/vscode-python-manager/environmentManager/resources/demo.gif>

### Quickly change your Workspace Python Environment

<video src="https://github.com/DonJayamanne/vscode-python-manager/raw/main/images/activeWorkspaceEnv.mp4" autoplay loop controls muted width="600px" title="Quickly Change Workspace Python Environment"></video>

### Workspace Environments

<video src="https://github.com/DonJayamanne/vscode-python-manager/raw/main/images/workspaceEnvs.mp4" autoplay loop controls muted width="600px" title="Workspace Environments"></video>

### Create Workspace Environments

<video src="https://github.com/DonJayamanne/vscode-python-manager/raw/main/images/createVenv.mp4" autoplay loop controls muted width="600px" title="Create Workspace Environments"></video>

### Create Other Environments (Conda, PyEnv, etc)

<video src="https://github.com/DonJayamanne/vscode-python-manager/raw/main/images/createVenv.mp4" autoplay loop controls muted width="600px" title="Create Other Environments (Conda, PyEnv, etc)"></video>

### Manage Packages (install, update, and uninstall)

<video src="https://github.com/DonJayamanne/vscode-python-manager/raw/main/images/managePackages.mp4" autoplay loop controls muted width="600px" title="Manage Packages (install, update, and uninstall)"></video>
