// ==UserScript==
// @name         Jira Planning Poker Vote Counter
// @namespace    http://www.kriz.net/
// @version      1.0
// @description  Add a total votes counter and other features to the planning poker panel.
// @author       jim@kriz.net
// @match        https://kroger.atlassian.net/browse/*
// @match        https://kroger.atlassian.net/jira/*selectedIssue=*
// @match        https://eausm-connect.easyagile.zone/planning-poker-view*
// @run-at       document-idle
// ==/UserScript==

// Test story: https://kroger.atlassian.net/browse/DCPSERV-75026
// Test spike: https://kroger.atlassian.net/browse/DCPSERV-77231

(function() {
    'use strict';
    const titleText = 'Easy Agile Planning Poker';
    const maxAttachAttempts = 5;
    const delayBetweenAttempts = 1000;
    let planningPokerObserverAttached = false;

    // If we are on the voting panel page, we need to attach the vote count listener directly to 
    // the voting panel. If we are on the main page for an issue, we just need to attach some
    // listeners to the page, so we can handle events that are fired from the iframe.
    //
    // This works for both the single issue browse view, and the "pop-up" view from the
    // issue navigator.
    if (location.href.includes('eausm-connect.easyagile.zone/planning-poker-view')) {
        tryAttachVoteCountListener();
    } else {
        addIframeEventListener();
    }

    function addIframeEventListener() {
        // Add listener to the main page to handle messages from the iframe
        window.addEventListener('message', (event) => {
            if (event.data.type === 'updateVoteCount') {
                console.debug(`VOTECOUNTER: Received updateVoteCount message with data: ${JSON.stringify(event.data)}`);
                const { planningPokerTitle, _ } = getVotingElements();
                planningPokerTitle.innerText = `${titleText} - ${event.data.voteCount}`;
            } else if (event.data.type === 'getIssueType') {
                console.debug('VOTECOUNTER: Received getIssueType message, fetching issue type');
                const issueType = document.querySelector('div[data-testid="issue.views.issue-base.foundation.breadcrumbs.breadcrumb-current-issue-container"] img')?.alt?.trim()?.toLowerCase();
                event.source.postMessage({
                    type: 'issueTypeResponse',
                    issueType: issueType
                }, event.origin);
            } else if(event.data.type === 'updateTimebox') {
                console.debug(`VOTECOUNTER: Received updateTimebox message with data: ${JSON.stringify(event.data)}`);
                const timeBoxDays = event.data.timeBoxDays;
                if (timeBoxDays && !isNaN(timeBoxDays)) {
                    setTimeboxOnIssue(timeBoxDays);
                } else {
                    console.warn('VOTECOUNTER: Invalid timebox days received:', timeBoxDays);
                }
            }            
        }, false);
    }

    // Attempt to attach the vote count listener up to maxAttachAttempts times
    // This hopefully accounts for slowness loading the voting panel
    function tryAttachVoteCountListener(attempt = 0) {
        if (attempt >= maxAttachAttempts) {
            console.warn('Max attempts to attach vote count listener reached');
            console.warn('Page may not be a jira issue page with a voting panel');
            return;
        }

        if (!attachVoteCountListener()) {
            setTimeout(() => {
                tryAttachVoteCountListener(attempt + 1);
            }, delayBetweenAttempts);
        }
    }

    function attachVoteCountListener() {
        const { _, votesPanel } = getVotingElements();

        if (!votesPanel) {
            return false;
        }

        window.addEventListener('message', (event) => {
            if(event.data.type === 'issueTypeResponse') {
                console.debug(`VOTECOUNTER: Voting IFrame Received issueTypeResponse with data: ${JSON.stringify(event.data)}`);
                const issueType = event.data.issueType;
                if (issueType) {
                    console.debug(`VOTECOUNTER: Issue type is ${issueType}`);
                    if (issueType === 'bug' || issueType === 'spike') {
                        tryCreateUpdateTimeboxLink();
                    }
                } else {
                    console.warn('VOTECOUNTER: No issue type received from parent window');
                }
            }
        }, false);
        fireGetIssueTypeEvent();
 
        updateVoteCount(votesPanel);

        const votesPanelObserver = new MutationObserver(() => {
            updateVoteCount(votesPanel);
        });
        votesPanelObserver.observe(votesPanel, { childList: true, subtree: true, attributes: true, characterData: true });

        // With this being an iframe now, and with the user script triggering on the iframe page as well,
        // I don't think we need this anymore. If we do need it, it will need refactoring, because the elements
        // it looks for have changed, and the structure is a little different now.
        //addMonitorForPlanningPokerReAttached()

        return true;
    }

    // Monitor for the planning poker view to be re-attached to the issue content
    // function addMonitorForPlanningPokerReAttached() {
    //     if (!planningPokerObserverAttached) {
    //         const issueContent = document.getElementById('issue-content');

    //         if (issueContent) {
    //             // Monitor for planningPokerView removal and re-addition
    //             const issueContentObserver = new MutationObserver((mutations) => {
    //                 mutations.forEach((mutation) => {
    //                     mutation.addedNodes.forEach((node) => {
    //                         if (node.id === 'eausm-planning-poker-issue-view-web-panel') {
    //                             console.debug('VOTECOUNTER: eausm-planning-poker-issue-view-web-panel added');
    //                             if (!document.getElementById('user-script-vote-counter-update-button')) {
    //                                 tryAttachVoteCountListener();
    //                             }
    //                         }
    //                     });
    //                 });
    //             });

    //             // watch for voting panel to be re-loaded:
    //             issueContentObserver.observe(issueContent, { childList: true, subtree: true });

    //             planningPokerObserverAttached = true;
    //         }
    //     }
    // }

    function createUpdateTimeboxLink() {
        console.debug('VOTECOUNTER: Creating Update Timebox button');
        const buttonContainer = document.querySelector('[class*="PlanningPokerWebPanel__ButtonContainer"]');
        if (buttonContainer) {
            console.debug('VOTECOUNTER: Button container found, adding Update Timebox button');
            const timeboxButtonId = 'user-script-vote-counter-update-button';
            const storyPointsButton = buttonContainer.querySelector('[class*="ButtonWithPermissions__ButtonStyles"]');
            if (storyPointsButton && storyPointsButton.innerText.includes('Story Points')) {
                swapStoryPointsButtonWithTimeboxButton(storyPointsButton, timeboxButtonId, buttonContainer);
            }

            // Add a mutation observer on the buttonContainer to look for a button with a class like ButtonWithPermissions__ButtonStyles,
            // and if it appears, hide it and instead add a button that updates the timebox
            const buttonObserver = new MutationObserver((mutations) => {
                mutations.forEach((mutation) => {
                    mutation.addedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE && node.className.includes('ButtonWithPermissions__ButtonStyles') && node.innerText.includes('Story Points')) {
                            console.debug("VOTECOUNTER: found button with class ButtonWithPermissions__ButtonStyles, hiding it");
                            swapStoryPointsButtonWithTimeboxButton(node, timeboxButtonId, buttonContainer);
                        }
                    });
                    mutation.removedNodes.forEach((node) => {
                        if (node.nodeType === Node.ELEMENT_NODE && node.className.includes('ButtonWithPermissions__ButtonStyles') && node.innerText.includes('Story Points')) {
                            // If the actual EasyAgile button was removed, remove ours too
                            const existingButton = document.getElementById(timeboxButtonId);
                            if (existingButton) {
                                existingButton.remove(); // Remove the old button if it exists
                            }
                        }
                    });
                });
            });
            buttonObserver.observe(buttonContainer, { childList: true, subtree: true });
            return true;
        } else {
            return false;
        }
    }

    function swapStoryPointsButtonWithTimeboxButton(storyPointsButton, timeboxButtonId, buttonContainer) {
        // Copy the node to a new button that updates the timebox
        const newButton = storyPointsButton.cloneNode(true);
        newButton.id = timeboxButtonId;
        newButton.innerText = 'Update Timebox on Issue';

        storyPointsButton.style.display = 'none'; // Hide the original button
        
        newButton.addEventListener('click', (event) => {
            const estimateSpan = document.querySelector('[class^="PlanningPokerWebPanel__ButtonContainer"] > span');
            if (estimateSpan) {
                const match = estimateSpan.innerText.match(/Estimate:\s*(\d+)/);
                if (match) {
                    const timeBoxValue = parseInt(match[1], 10);
                    event.target.innerText = "Updating Timebox...";
                    event.target.disabled = true; // Disable the button to prevent multiple clicks
                    fireUpdateTimeboxEvent(timeBoxValue);
                } else {
                    console.warn('VOTECOUNTER: No valid estimate found in span text');
                }
            } else {
                console.warn('VOTECOUNTER: Span not found in button container when clicking button');
            }
        });
        buttonContainer.insertBefore(newButton, storyPointsButton);
    }

    function setUpdateButtonIsEnabled() {
        const updateButton = document.getElementById('user-script-vote-counter-update-button');
        if (updateButton) {
            const estimateSpan = document.querySelector('[class^="PlanningPokerWebPanel__ButtonContainer"] > span');
            const match = estimateSpan?.innerText?.match(/Estimate:\s*(\d+)/);
            if (match) {
                updateButton.disabled = false; // Enable the button if the span contains "Estimate: <number>"
            } else {
                updateButton.disabled = true; // Disable the button if the span does not contain "Estimate: <number>"
            }
        }
        
    }

    function updateVoteCount(votesPanel) {
        const totalVotes = votesPanel.children?.length || 0;
        const majorityVote = getMajorityVote(votesPanel);
        fireUpdateVoteCountEvent(`Votes: ${totalVotes}${majorityVote ? ' - ' + majorityVote : ''}`);
        setUpdateButtonIsEnabled();
    }

    function fireUpdateVoteCountEvent(voteCountText) {
        window.parent.postMessage({
            type: 'updateVoteCount',
            voteCount: voteCountText
        }, '*');
    }

    function fireGetIssueTypeEvent() {
        window.parent.postMessage({
            type: 'getIssueType'
        }, '*');
    }

    function fireUpdateTimeboxEvent(timeBoxDays) {
        window.parent.postMessage({
            type: 'updateTimebox',
            timeBoxDays: timeBoxDays
        }, '*');
    }

    function getMajorityVote(votesPanel) {
        if (!votesPanel.children?.length) {
            return null;
        }
        const votes = {};
        [...votesPanel.children].forEach(vote => {
            const voteEstimate = vote.querySelector('[class*=EstimateVote__EstimateShown]');
            const voteValue = voteEstimate?.innerText;
            if (voteValue) {
                votes[voteValue] = votes[voteValue] ? votes[voteValue] + 1 : 1;
            }
        });
        if (!Object.keys(votes).length) {
            return null;
        }

        const majorityVote = Object.keys(votes).reduce((a, b) => votes[a] > votes[b] ? a : b);
        const majorityVoteCount = votes[majorityVote];
        const majorityVotePercent = (majorityVoteCount / votesPanel.children.length) * 100;
        const tieVotes = Object.keys(votes).filter(vote => votes[vote] === majorityVoteCount);
        const isTie = tieVotes.length > 1;
        const headerWord = majorityVotePercent > 50 ? 'Majority' : 'Plurality';

        if (isTie) {
            return `${headerWord}: ${tieVotes.join(', ')} (${majorityVoteCount} votes each, ${majorityVotePercent.toFixed(0)}%)`;
        } else {
            return `${headerWord}: ${majorityVote} (${majorityVoteCount} votes, ${majorityVotePercent.toFixed(0)}%)`;
        }
    }

    function getVotingElements() {
        const planningPokerTitle = document.evaluate(
            `//span[contains(text(), '${titleText}')]`,
            document,
            null,
            XPathResult.FIRST_ORDERED_NODE_TYPE,
            null
          ).singleNodeValue;
        const votesPanel = document.querySelector('[class*=PlanningPokerWebPanel__DisplayedVotesWrapper]');
        return { planningPokerTitle, votesPanel };
    }

    function setTimeboxOnIssue(timeBoxDays) {
        const issueKeyMatch = window.location.href.match(/(?:browse|issue)\/([A-Z]+-\d+)|selectedIssue=([A-Z]+-\d+)/);
        const issueKey = issueKeyMatch[1] || issueKeyMatch[2];

        console.log('Current issue key:', issueKey);

        const url = AJS.contextPath() + `/rest/api/2/issue/${issueKey}`;

        // Use AJA.$.Ajax to get the current issue details, then call addTimeboxToDescription
        AJS.$.ajax({
            url: url,
            type: 'GET',
            contentType: 'application/json',
            success: function(response) {
                console.debug('VOTECOUNTER: Retrieved issue successfully', response);
                // Update the issue, adding the timeBox to the description
                addTimeboxToDescription(response, timeBoxDays);
            },
            error: function(xhr, status, error) {
                console.error('VOTECOUNTER: Failed to update description field', status, error);
            }
        });
    }

    function addTimeboxToDescription(issue, timeBoxDays) {
        const url = AJS.contextPath() + `/rest/api/2/issue/${issue.key}`;

        const timeBox = `*Timebox: ${timeBoxDays} day${timeBoxDays > 1 ? "s" : ""}*\n\n`;

        // Check if the description already contains a timebox
        const description = issue.fields.description || '';
        const timeboxRegex = /\*Timebox:\s*\d+\s*day(s)?\*(\s)+/i;
        const updatedDescription = timeBox + description.replace(timeboxRegex, '');

        const data = {
            fields: {
                description: updatedDescription
            }
        };

        AJS.$.ajax({
            url: url,
            type: 'PUT',
            contentType: 'application/json',
            data: JSON.stringify(data),
            success: function(response) {
                console.debug('VOTECOUNTER: Description updated successfully', response);
                // Refresh the issue in the page
                JIRA.IssueNavigator.reload();
            },
            error: function(xhr, status, error) {
                console.error('VOTECOUNTER: Failed to update description', status, error);
            }
        });
    }
})();
