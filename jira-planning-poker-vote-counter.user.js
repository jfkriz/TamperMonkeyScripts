// ==UserScript==
// @name         Jira Planning Poker Vote Counter
// @namespace    http://www.kriz.net/
// @version      0.1
// @description  Add a total votes counter to the planning poker panel.
// @author       jim@kriz.net
// @match        https://jira.kroger.com/jira/browse/*
// @run-at       document-idle
// @grant        none
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
        observer.observe(votesPanel, { childList: true });

        return true;
    }

    function updateVoteCount(planningPokerTitle, votesPanel) {
        const totalVotes = votesPanel.children?.length || 0;
        planningPokerTitle.innerText = `${titleText} (Votes: ${totalVotes})`;
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
})();
