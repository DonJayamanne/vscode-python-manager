# Python Environment Manager

A [Visual Studio Code](https://code.visualstudio.com/) [extension](https://marketplace.visualstudio.com/items?itemName=ms-toolsai.jupyter) that provides the ability to via and manage all of your Python environments & packages from a single place.

## Features
* Viewing all of your Python environments grouped by their type (Conda, PyEnv, etc)
* Creating a terminal with the environment activated.
* Create/delete Conda and Virtual Environments.
* Install Python along with Conda using [Micromamba](https://mamba.readthedocs.io/en/latest/user_guide/micromamba.html)
* Set a Python environment as the active workspace Python interpreter as used by the [Python Extension](https://marketplace.visualstudio.com/items?itemName=ms-python.python)
* View installed packages.

## Coming soon
* Viewing dependency tree of the python packages within an environment.
* Managing packages (install, update, etc)


<img src=https://raw.githubusercontent.com/DonJayamanne/vscode-python-manager/environmentManager/resources/demo.gif>



**Notes:**
* This extension is built on top (forked copy) of the [Python extension](https://marketplace.visualstudio.com/items?itemName=ms-python.python).
    * Majority of the code, such as discovery of Python environments is borrowed from the Python extension.
* Here are a list of features that differentiates this from the [Python extension](https://marketplace.visualstudio.com/items?itemName=ms-python.python)?
    * Access Virtual Environments that belong to other workspace folders.
    * Create multiple terminals for different Python environments.
    * Create terminals activated with Global Python environments (even though there are no activation scripts for such environments).
    * Ability to view installed packages.
    * Create/delete Conda and Virtual Environments.
    * Install Python along with Conda using [Micromamba](https://mamba.readthedocs.io/en/latest/user_guide/micromamba.html)

