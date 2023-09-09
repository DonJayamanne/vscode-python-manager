# Python Environment Manager

A [Visual Studio Code](https://code.visualstudio.com/) [extension](https://marketplace.visualstudio.com/items?itemName=ms-toolsai.jupyter) that provides the ability to via and manage all of your Python environments & packages from a single place.

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

<table>
  <tr>
    <td valign="top">
    <video autoplay loop muted markdown="1" height="250px" >
        <source src="./images/activeWorkspaceEnv.mp4" type="video/mp4" markdown="1" >
    </video>
    </td>
    <td valign="top">
    <ul>
<li> Find your environment and just click on the ★ (star) icon.</li>
</ul>
    </td>
  </tr>
 </table>

### Workspace Environments

<table>
  <tr>
    <td valign="top">
    <video autoplay loop muted markdown="1" width="450px" >
        <source src="./images/workspaceEnvs.mp4" type="video/mp4" markdown="1" >
    </video>
    </td>
    <td valign="top">
    <ul>
<li> View all of the Python environments that belong to the current workspace.</li>
<li> This can serve as a quick way to tell that a workspace folder has a specific environment.</li>
<li> In this sample, one can see that the folder as a virtual environment named `.venv` but the active Python Enviornment is `base`.</li>
</ul>
    </td>
  </tr>
 </table>


### Create Workspace Environments

<video autoplay loop muted markdown="1" width="450px" >
    <source src="./images/createVenv.mp4" type="video/mp4" markdown="1" >
</video>

### Create Other Environments (Conda, PyEnv, etc)

<video autoplay loop muted markdown="1" width="450px" >
    <source src="./images/createVenv.mp4" type="video/mp4" markdown="1" >
</video>


### Manage Packages (install, update, and uninstall)

<video autoplay loop muted markdown="1" width="450px" >
    <source src="./images/managePackages.mp4" type="video/mp4" markdown="1" >
</video>

