// ==UserScript==
// @name         Jira Planning Poker Vote Counter
// @namespace    http://www.kriz.net/
// @version      0.4
// @description  Add a total votes counter to the planning poker panel.
// @author       jim@kriz.net
// @match        https://jira.kroger.com/jira/browse/*
// @run-at       document-idle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_notification
// ==/UserScript==

(function() {
    'use strict';
    const titleText = 'Easy Agile Planning Poker';

    const maxAttachAttempts = 5;
    const delayBetweenAttempts = 1000;
    let planningPokerObserverAttached = false;

    tryAttachVoteCountListener();

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
        const { planningPokerTitle, votesPanel } = getVotingElements();

        if (!planningPokerTitle || !votesPanel) {
            return false;
        }

        addUpdateStoryPointsButton()

        updateVoteCount(planningPokerTitle, votesPanel);

        const votesPanelObserver = new MutationObserver(() => {
            updateVoteCount(planningPokerTitle, votesPanel);
        });
        votesPanelObserver.observe(votesPanel, { childList: true, subtree: true, attributes: true, characterData: true });

        autoEnableLiveUpdate();

        addMonitorForPlanningPokerReAttached()

        return true;
    }

    // Monitor for the planning poker view to be re-attached to the issue content
    function addMonitorForPlanningPokerReAttached() {
        if (!planningPokerObserverAttached) {
            const issueContent = document.getElementById('issue-content');

            if (issueContent) {
                // Monitor for planningPokerView removal and re-addition
                const issueContentObserver = new MutationObserver((mutations) => {
                    mutations.forEach((mutation) => {
                        mutation.addedNodes.forEach((node) => {
                            if (node.id === 'eausm-planning-poker-issue-view-web-panel') {
                                console.debug('VOTECOUNTER: eausm-planning-poker-issue-view-web-panel added');
                                if (!document.getElementById('user-script-vote-counter-update-button')) {
                                    tryAttachVoteCountListener();
                                }
                            }
                        });
                    });
                });

                // watch for voting panel to be re-loaded:
                issueContentObserver.observe(issueContent, { childList: true, subtree: true });

                planningPokerObserverAttached = true;
            }

            
        }
    }

    function addUpdateStoryPointsButton() {
        console.debug("VOTECOUNTER: before adding button");

        let button = document.getElementById('user-script-vote-counter-update-button');

        if (button) {
            console.debug("VOTECOUNTER: button already exists");
            return false;
        }

        const planningPokerView = document.getElementById('planning-poker-view');
        if (!planningPokerView) {
            console.warn('VOTECOUNTER: Planning Poker view not found');
            return false;
        }

        const votingAreaContainer = document.querySelector('[class^="PlanningPokerWebPanel__VotingArea"]');
        if (votingAreaContainer)
        {
            //const buttonContainer = document.querySelector('[class^="PlanningPokerWebPanel__ButtonContainer"]');
            console.debug("VOTECOUNTER: planningPokerViewObserver before button add", votingAreaContainer, button);
            if (!button) {
                const buttonWrapper = document.createElement('div');
                buttonWrapper.style.textAlign = 'right'; // Align the button to the right

                button = document.createElement('button');
                button.id = 'user-script-vote-counter-update-button';
                button.innerText = 'Update Story Points';
                button.className = 'css-1l34k60'; // Add the specified class to the button
                button.style.marginTop = '5px';
                button.disabled = true; // Initially disable the button
                button.addEventListener('click', (event) => {
                    const estimateSpan = document.querySelector('[class^="PlanningPokerWebPanel__ButtonContainer"] > span');
                    if (estimateSpan) {
                        const match = estimateSpan.innerText.match(/Estimate:\s*(\d+)/);
                        if (match) {
                            const storyPointsValue = parseInt(match[1], 10);
                            event.target.innerText = "Updating Story Points...";
                            event.target.disabled = true; // Disable the button to prevent multiple clicks
                            setPointsOnIssue(storyPointsValue);
                        } else {
                            console.warn('VOTECOUNTER: No valid estimate found in span text');
                        }
                    } else {
                        console.warn('VOTECOUNTER: Span not found in button container when clicking button');
                    }
                });

                console.debug("VOTECOUNTER: after adding button");

                buttonWrapper.appendChild(button);
                votingAreaContainer.parentNode.insertBefore(buttonWrapper, votingAreaContainer.nextSibling);
            }
        } else {
            console.warn('VOTECOUNTER: Span not found in button container when trying to add observer');
        }
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

    function updateVoteCount(planningPokerTitle, votesPanel) {
        const totalVotes = votesPanel.children?.length || 0;
        const majorityVote = getMajorityVote(votesPanel);
        planningPokerTitle.innerText = `${titleText} - Votes: ${totalVotes}${majorityVote ? ' - ' + majorityVote : ''}`;
        setUpdateButtonIsEnabled();
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

    function autoEnableLiveUpdate() {
        const liveUpdateSwitch = document.getElementById('live-updates');

        if (!liveUpdateSwitch) {
            return false;
        }

        const isLiveUpdateAlreadyEnabled = liveUpdateSwitch.parentNode.getAttribute("data-checked");

        const autoEnableLiveUpdatesUntilString = GM_getValue("autoEnableLiveUpdatesUntil", null);

        if (!isLiveUpdateAlreadyEnabled && autoEnableLiveUpdatesUntilString) {
            const autoEnableLiveUpdatesUntilDate = new Date(autoEnableLiveUpdatesUntilString);
            const now = new Date();

            if (now < autoEnableLiveUpdatesUntilDate) {
                liveUpdateSwitch.click();
            }
        }

        liveUpdateSwitch.addEventListener("click", onLiveUpdateClicked);
    }

    function onLiveUpdateClicked(event) {
        const isChecked = event.target.parentNode.getAttribute("data-checked") !== "true"; // opposite of expected because attribute changes after this function runs

        if (isChecked) {
            const twoHoursFromNow = addHours(new Date(), 2);
            GM_setValue("autoEnableLiveUpdatesUntil", twoHoursFromNow.getTime());
            showLiveUpdateNotification(twoHoursFromNow);
        } else {
            GM_setValue("autoEnableLiveUpdatesUntil", null);
        }
    }

    function showLiveUpdateNotification(autoEnableLiveUpdatesUntil) {
        const timesToShowNotification = 5;
        let timesNotificationShown = GM_getValue("autoUpdateNotificationTimesShown", 0);

        if (timesNotificationShown < timesToShowNotification) {
            timesNotificationShown++;
            GM_setValue("autoUpdateNotificationTimesShown", timesNotificationShown);
            const timesToShowMessage = (timesToShowNotification - timesNotificationShown) > 0
                ? `This will only be shown ${timesToShowNotification - timesNotificationShown} more time${ (timesToShowNotification - timesNotificationShown) > 1 ? "s" : "" }.`
                : "This will not be shown again.";
            GM_notification({text: `Live updates will be enabled on all Jira issues until ${autoEnableLiveUpdatesUntil.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}. ${timesToShowMessage}`,
                         title: "Jira Planning Poker Automatic Live Updates",
                         silent: true,
                         timeout: 5000,
                         image: 'https://jira.kroger.com/jira/s/-u4obiy/9120013/za3vhj/_/images/fav-jsw.png'
                        });
        }
    }

    function addHours(date, hours) {
        const hoursToAdd = hours * 60 * 60 * 1000;
        date.setTime(date.getTime() + hoursToAdd);
        return date;
    }

    function setPointsOnIssue(storyPointsValue) {
        // Get the issue key of the current Jira issue
        const issueKey = JIRA.Issue.getIssueKey();

        console.log('Current issue key:', issueKey);

        const fieldName = 'customfield_11601'; // Story Points field

        const url = AJS.contextPath() + `/rest/api/2/issue/${issueKey}`;
        const data = {
            fields: {
                [fieldName]: storyPointsValue
            }
        };

        AJS.$.ajax({
            url: url,
            type: 'PUT',
            contentType: 'application/json',
            data: JSON.stringify(data),
            success: function(response) {
                console.debug('VOTECOUNTER: Field updated successfully', response);
                // Refresh the issue in the page
                JIRA.IssueNavigator.reload();
            },
            error: function(xhr, status, error) {
                console.error('VOTECOUNTER: Failed to update field', status, error);
            }
        });
    }


})();
