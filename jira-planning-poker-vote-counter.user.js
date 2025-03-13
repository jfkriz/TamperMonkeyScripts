// ==UserScript==
// @name         Jira Planning Poker Vote Counter
// @namespace    http://www.kriz.net/
// @version      0.2
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

    if (!attachVoteCountListener()) {
        // Try again after a delay, in case the elements are slow to render (seems like the votes panel is typically delayed a second or two)
        setTimeout(() => {
            attachVoteCountListener();
        }, 2500);
    }

    function attachVoteCountListener() {
        const { planningPokerTitle, votesPanel } = getVotingElements();

        if (!planningPokerTitle || !votesPanel) {
            console.warn('Page may not be a jira issue page with a voting panel');
            return false;
        }

        updateVoteCount(planningPokerTitle, votesPanel);

        const observer = new MutationObserver(() => {
            updateVoteCount(planningPokerTitle, votesPanel);
        });
        observer.observe(votesPanel, { childList: true, subtree: true, attributes: true, characterData: true });

        autoEnableLiveUpdate();

        return true;
    }

    function updateVoteCount(planningPokerTitle, votesPanel) {
        const totalVotes = votesPanel.children?.length || 0;
        const majorityVote = getMajorityVote(votesPanel);
        planningPokerTitle.innerText = `${titleText} - Votes: ${totalVotes}${majorityVote ? ' - ' + majorityVote : ''}`;
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
        var timesNotificationShown = GM_getValue("autoUpdateNotificationTimesShown", 0);

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
})();
