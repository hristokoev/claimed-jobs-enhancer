// ==UserScript==
// @name         Claimed Jobs
// @namespace    https://fluently.moravia.com/jobs/claimed
// @version      0.1
// @description  Group assets by comments and open all, invert selection, select all
// @author       You
// @match        https://fluently.moravia.com/jobs/claimed
// @grant    GM_openInTab
// ==/UserScript==

(function () {
  "use strict";

  // Function to find the session storage item with a specific target
  function findTokenKey({ target }) {
    const keys = Object.keys(sessionStorage);

    for (const key of keys) {
      try {
        // Retrieve and parse the item
        const item = JSON.parse(sessionStorage.getItem(key));

        // Check if the item contains the target
        if (
          item &&
          item.tokenType === "Bearer" &&
          item.target.includes(target)
        ) {
          // Return the key.secret if available
          return item["secret"] || null;
        }
      } catch (e) {
        console.error("Error parsing session storage item:", e);
        // Handle errors in parsing JSON or accessing properties
      }
    }

    console.error("No item found with the specified target");
    return null;
  }

  // Function to collect URLs for each group
  function collectUrlsForGroup(cloudUids) {
    const urls = [];

    if (cloudUids.length === 1) {
      urls.push(
        `https://cloud.memsource.com/web/job/${cloudUids[0]}/translate`
      );
    } else if (cloudUids.length > 1) {
      urls.push(
        `https://cloud.memsource.com/web/job/${cloudUids.join("-")}/translate`
      );
    }

    return urls;
  }

  // Function to open all collected URLs in new tabs with a delay
  function openAllUrls(urls) {
    const delay = 100; // Delay in milliseconds between opening tabs

    urls.forEach((url, index) => {
      setTimeout(() => {
        GM_openInTab(url);
      }, index * delay); // Delay increases with index to open tabs sequentially
    });
  }

  // Function to fetch data using the token from session storage
  async function fetchWithSessionToken(url) {
    const token = findTokenKey({ target: "/api" });

    if (!token) {
      console.error("No token found");
      return null;
    }

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Fetch error:", error);
      return null;
    }
  }

  // Function to renew the data when opening an asset
  async function renewData(filteredData) {
    const token = findTokenKey({ target: "/api" });

    if (!token) {
      console.error("No token found");
      return null;
    }

    const data = filteredData.map(
      ({ assetPKID, cloudProjectUid, cloudUid }) => ({
        AssetPKID: assetPKID,
        CloudProjectId: cloudProjectUid,
        CloudUid: cloudUid,
      })
    );

    try {
      const response = await fetch("/api/asset/RenewLicense", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }
    } catch (error) {
      console.error("Fetch error:", error);
    }

    return null;
  }

  async function fetchProgressData(assetPkIds) {
    const url = `/api/v2.0/AssetAdditionalData?type=2&assetPkIds=${assetPkIds}`;
    const token = findTokenKey({ target: "api" });

    if (!token) {
      console.error("No token found");
      return null;
    }

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! Status: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error("Fetch error:", error);
      return null;
    }
  }

  // Function to group data by comment
  function groupDataByComment(data) {
    const groups = {};

    data.forEach((item) => {
      if (item.comment) {
        const comment = item.comment;
        const assetPkId = item.assetPkId;
        if (!groups[comment]) {
          groups[comment] = [];
          groups[assetPkId] = [];
        }
        groups[comment].push(item.cloudUid);
      }
    });

    return groups;
  }

  // Function to filter data by progress
  function filterDataByProgress(data, progressData, isExact100) {
    // Create a set of asset IDs that have a specific progress status
    const progressMap = new Map(
      progressData.map((item) => [item.assetPkId, item.progress])
    );

    const filteredData = data.filter((item) => {
      const progress = progressMap.get(item.assetPKID);
      if (progress === undefined) {
        // Include item if progress information is missing
        return isExact100 ? false : true;
      }
      // Check if the progress meets the filtering criteria
      return isExact100 ? progress === 100 : progress !== 100;
    });

    return filteredData;
  }

  // Main function to handle the entire process
  async function openAll(data) {
    if (!data) return;

    const assetPkIds = data.map((data) => data.assetPKID).join(",");
    const progressData = await fetchProgressData(assetPkIds);

    // Group and sort data by comment
    const filteredData = filterDataByProgress(data, progressData, false);
    const groupedData = groupDataByComment(filteredData);

    // Collect all URLs
    const allUrls = [];
    for (const cloudUids of Object.values(groupedData)) {
      allUrls.push(...collectUrlsForGroup(cloudUids));
    }

    await renewData(filteredData);

    // Open all URLs in new tabs
    openAllUrls(allUrls);
  }

  // Function to select and click elements
  // THIS IS FETCHING AND IS SLOWER
  /*
  async function selectAssets() {
      const url = '/api/asset/claimed';
      const data = await fetchWithSessionToken(url);
      const assetPkIds = data.map(data => data.assetPKID).join(',');
      const progressData = await fetchProgressData(assetPkIds);

      if (!data) return;

      // Group and sort data by comment
      const filteredData = filterDataByProgress(data, progressData, true);

      // Generate element IDs and click each
      filteredData.forEach(asset => {
          const elementId = `jobs-claimed-assetPKID-${asset.assetPKID}01`;
          const element = document.getElementById(elementId);
          if (element) {
              element.click();  // Simulate the click event
          } else {
              console.log(`Element with ID: ${elementId} not found.`);
          }
      });
  }
  */

  // THIS SHOULD BE FASTER SINCE IT'S NOT FETCHING
  async function selectAssets() {
    const allAssets = document.querySelectorAll(
      '[id^="jobs-claimed-awesome-table-item-"]'
    );
    const prefix = "jobs-claimed-awesome-table-item-";

    allAssets.forEach((asset) => {
      const progressBar = asset.children[1].children[0].children[0].children[0];
      const elementSelectId = `jobs-claimed-select-${asset.id.substring(
        prefix.length
      )}`;
      const elementSelect = document.getElementById(elementSelectId);
      const elementSelectCheckbox = elementSelect.children[0].children[0];
      if (progressBar.className.includes("ub-w_100prcn")) {
        !elementSelectCheckbox.checked && elementSelectCheckbox.click();
      } else {
        elementSelectCheckbox.checked && elementSelectCheckbox.click();
      }
    });
  }

  // Function to invert selection
  async function invertSelection() {
    const allAssets = document.querySelectorAll(
      '[id^="jobs-claimed-awesome-table-item-"]'
    );
    const prefix = "jobs-claimed-awesome-table-item-";

    // Invert click
    allAssets.forEach((asset) => {
      const elementId = `jobs-claimed-assetPKID-${asset.id.substring(
        prefix.length
      )}`;
      const element = document.getElementById(elementId);
      if (element) {
        element.click(); // Simulate the click event
      } else {
        console.log(`Element with ID: ${elementId} not found.`);
      }
    });
  }

  function roundToOneDecimal(value) {
    return Math.ceil(value * 10) / 10;
  }

  // Function to calculate earnings for the month
  async function calculateEarnings(providedData) {
    const url = (from, to, quality) =>
      `/api/v2/Metric/Volume?from=${from}&to=${to}&qualityLevel[0]=${quality}`;
    const token = findTokenKey({ target: "/fluently-api" });

    if (!token) {
      console.error("No token found");
      return null;
    }

    // Create a new Date object for the current date
    const now = new Date();

    // Extract the year and month from the current date
    const year = now.getFullYear();
    const month = now.getMonth(); // Note: month is zero-based (0 = January, 1 = February, etc.)

    // Get today's date in YYYY-MM-DD format
    const today = `${year}-${String(month + 1).padStart(2, "0")}-${String(
      now.getDate()
    ).padStart(2, "0")}`;

    // Create a Date object for the first day of the current month
    const firstDayOfMonth = new Date(year, month, 1);
    const firstDay = `${firstDayOfMonth.getFullYear()}-${String(
      firstDayOfMonth.getMonth() + 1
    ).padStart(2, "0")}-${String(firstDayOfMonth.getDate()).padStart(2, "0")}`;

    // Define the quality multipliers
    const qualityMultipliers = [
      { quality: "standard", multiplier: 0.787 },
      { quality: "high", multiplier: 1.036 },
    ];

    // Process the provided data
    const wordCountByQuality = providedData.reduce((acc, item) => {
      const qualityKey = item.qualityName.toLowerCase();
      if (!acc[qualityKey]) {
        acc[qualityKey] = 0;
      }
      acc[qualityKey] += item.wordcount;
      return acc;
    }, {});

    try {
      // Fetch and aggregate data from the API
      const apiDataPromises = qualityMultipliers.map(async ({ quality }) => {
        const response = await fetch(url(firstDay, today, quality), {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
        });

        if (!response.ok) {
          throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const apiData = await response.json();
        // Aggregate the API data
        return {
          quality,
          wordcount: apiData.processedWords || 0,
        };
      });

      const apiData = await Promise.all(apiDataPromises);

      // Combine provided data and API data
      apiData.forEach(({ quality, wordcount }) => {
        const qualityKey = quality.toLowerCase();
        if (!wordCountByQuality[qualityKey]) {
          wordCountByQuality[qualityKey] = 0;
        }
        wordCountByQuality[qualityKey] += wordcount;
      });

      // Calculate the earnings
      const results = qualityMultipliers.map(({ quality, multiplier }) => {
        const processedWords = wordCountByQuality[quality] || 0;
        return (roundToOneDecimal(processedWords) || 0) * multiplier;
      });

      // Sum up the results
      const result = results.reduce((acc, value) => acc + value, 0);
      return result;
    } catch (error) {
      console.error("Fetch error:", error);
      return null;
    }
  }

  // Function to create and insert the custom button
  async function addUi() {
    const url = "/api/asset/claimed";
    const data = await fetchWithSessionToken(url);

    // Select the buttons nav
    const buttonsNav = document.getElementById(
      "jobs-claimed-complete-button"
    ).parentNode;

    // Create new button elements
    let buttonOpenAll = document.createElement("button");
    buttonOpenAll.className =
      "ub-pst_relative ub-f-wght_500 ub-dspl_inline-flex ub-algn-itms_center ub-flx-wrap_nowrap ub-just-cnt_center ub-txt-deco_none ub-ver-algn_middle ub-b-btm_1px-solid-c1c4d6 ub-b-lft_1px-solid-c1c4d6 ub-b-rgt_1px-solid-c1c4d6 ub-b-top_1px-solid-c1c4d6 ub-otln_iu2jf4 ub-usr-slct_none ub-crsr_pointer ub-wht-spc_nowrap ub-fnt-fam_b77syt ub-bblr_4px ub-bbrr_4px ub-btlr_4px ub-btrr_4px ub-color_474d66 ub-tstn_n1akt6 ub-h_32px ub-min-w_32px ub-fnt-sze_12px ub-ln-ht_32px ub-pl_16px ub-pr_16px ub-bg-clr_white ub-bs_13po50p_xpy5ci ub-crsr_not-allowed_yzzm16 ub-ptr-evts_none_yzzm16 ub-color_c1c4d6_yzzm16 ub-b-btm-clr_E6E8F0_yzzm16 ub-b-lft-clr_E6E8F0_yzzm16 ub-b-rgt-clr_E6E8F0_yzzm16 ub-b-top-clr_E6E8F0_yzzm16 ub-b-btm_1px-solid-8f95b2_vmhk7m ub-b-lft_1px-solid-8f95b2_vmhk7m ub-b-rgt_1px-solid-8f95b2_vmhk7m ub-b-top_1px-solid-8f95b2_vmhk7m ub-bg-clr_FAFBFF_vmhk7m ub-bg-clr_e1ecf8_hxa9p6 ub-mt_8px ub-ml_8px ub-box-szg_border-box";
    buttonOpenAll.id = "jobs-open-all-button";
    buttonOpenAll.style =
      "-webkit-font-smoothing: antialiased; appearance: none;";
    let buttonSelectCompleted = document.createElement("button");
    buttonSelectCompleted.className =
      "ub-pst_relative ub-f-wght_500 ub-dspl_inline-flex ub-algn-itms_center ub-flx-wrap_nowrap ub-just-cnt_center ub-txt-deco_none ub-ver-algn_middle ub-b-btm_1px-solid-c1c4d6 ub-b-lft_1px-solid-c1c4d6 ub-b-rgt_1px-solid-c1c4d6 ub-b-top_1px-solid-c1c4d6 ub-otln_iu2jf4 ub-usr-slct_none ub-crsr_pointer ub-wht-spc_nowrap ub-fnt-fam_b77syt ub-bblr_4px ub-bbrr_4px ub-btlr_4px ub-btrr_4px ub-color_474d66 ub-tstn_n1akt6 ub-h_32px ub-min-w_32px ub-fnt-sze_12px ub-ln-ht_32px ub-pl_16px ub-pr_16px ub-bg-clr_white ub-bs_13po50p_xpy5ci ub-crsr_not-allowed_yzzm16 ub-ptr-evts_none_yzzm16 ub-color_c1c4d6_yzzm16 ub-b-btm-clr_E6E8F0_yzzm16 ub-b-lft-clr_E6E8F0_yzzm16 ub-b-rgt-clr_E6E8F0_yzzm16 ub-b-top-clr_E6E8F0_yzzm16 ub-b-btm_1px-solid-8f95b2_vmhk7m ub-b-lft_1px-solid-8f95b2_vmhk7m ub-b-rgt_1px-solid-8f95b2_vmhk7m ub-b-top_1px-solid-8f95b2_vmhk7m ub-bg-clr_FAFBFF_vmhk7m ub-bg-clr_e1ecf8_hxa9p6 ub-mt_8px ub-ml_8px ub-box-szg_border-box";
    buttonSelectCompleted.id = "jobs-select-completed-button";
    buttonSelectCompleted.style =
      "-webkit-font-smoothing: antialiased; appearance: none;";
    let buttonInvert = document.createElement("button");
    buttonInvert.className =
      "ub-pst_relative ub-f-wght_500 ub-dspl_inline-flex ub-algn-itms_center ub-flx-wrap_nowrap ub-just-cnt_center ub-txt-deco_none ub-ver-algn_middle ub-b-btm_1px-solid-c1c4d6 ub-b-lft_1px-solid-c1c4d6 ub-b-rgt_1px-solid-c1c4d6 ub-b-top_1px-solid-c1c4d6 ub-otln_iu2jf4 ub-usr-slct_none ub-crsr_pointer ub-wht-spc_nowrap ub-fnt-fam_b77syt ub-bblr_4px ub-bbrr_4px ub-btlr_4px ub-btrr_4px ub-color_474d66 ub-tstn_n1akt6 ub-h_32px ub-min-w_32px ub-fnt-sze_12px ub-ln-ht_32px ub-pl_16px ub-pr_16px ub-bg-clr_white ub-bs_13po50p_xpy5ci ub-crsr_not-allowed_yzzm16 ub-ptr-evts_none_yzzm16 ub-color_c1c4d6_yzzm16 ub-b-btm-clr_E6E8F0_yzzm16 ub-b-lft-clr_E6E8F0_yzzm16 ub-b-rgt-clr_E6E8F0_yzzm16 ub-b-top-clr_E6E8F0_yzzm16 ub-b-btm_1px-solid-8f95b2_vmhk7m ub-b-lft_1px-solid-8f95b2_vmhk7m ub-b-rgt_1px-solid-8f95b2_vmhk7m ub-b-top_1px-solid-8f95b2_vmhk7m ub-bg-clr_FAFBFF_vmhk7m ub-bg-clr_e1ecf8_hxa9p6 ub-mt_8px ub-ml_8px ub-box-szg_border-box";
    buttonInvert.id = "jobs-select-completed-button";
    buttonInvert.style =
      "-webkit-font-smoothing: antialiased; appearance: none;";

    // Add button text
    let buttonOpenAllText = document.createTextNode("Open all");
    let buttonSelectCompletedText = document.createTextNode("Select 100%");
    let buttonInvertText = document.createTextNode("Invert Selection");
    buttonOpenAll.appendChild(buttonOpenAllText);
    buttonSelectCompleted.appendChild(buttonSelectCompletedText);
    buttonInvert.appendChild(buttonInvertText);

    // Add click event listener
    buttonOpenAll.addEventListener("click", function () {
      openAll(data);
    });

    buttonSelectCompleted.addEventListener("click", function () {
      selectAssets();
    });

    buttonInvert.addEventListener("click", function () {
      invertSelection();
    });

    // Append button to the body
    buttonsNav.append(buttonOpenAll);
    buttonsNav.append(buttonSelectCompleted);
    buttonsNav.append(buttonInvert);

    // Select the UI wordcount
    const wordcountUiDiv = document.getElementById("jobs-claimed-wordcount");

    // Create 'earnings' box UI
    const strongElement = document.createElement("strong");
    strongElement.className =
      "ub-pl_8px ub-pr_8px ub-pb_8px ub-pt_8px ub-mt_8px ub-fnt-sze_16px ub-f-wght_600 ub-ln-ht_20px ub-ltr-spc_-0-05px ub-fnt-fam_b77syt ub-color_rgb102-120-138 ub-box-szg_border-box ub-bblr_4px ub-bbrr_4px ub-btlr_4px ub-btrr_4px";
    strongElement.id = "jobs-claimed-total-wordcount-info";
    strongElement.style.backgroundColor = "rgb(212, 238, 226)";

    // Create the `span` element
    const spanElement = document.createElement("span");

    // Set the text content and style for the span
    const earnings = await calculateEarnings(data);
    spanElement.textContent = `${roundToOneDecimal(earnings)} CZK 🤑`;
    spanElement.style.color = "rgb(71, 184, 129)";

    // Append the `span` element to the `strong` element
    strongElement.appendChild(document.createTextNode(`~EARNINGS: `));
    strongElement.appendChild(spanElement);

    // Append the `strong` element to the parent div
    wordcountUiDiv.appendChild(strongElement);
  }

  let hasRun = false; // Flag to ensure addUi runs only once

  // Function to check if loading div is gone and then call addUi
  function checkForLoadingDiv() {
    const appRoot = document.querySelector("#app-root");
    if (appRoot) {
      const loadingDiv = appRoot.querySelector("#fluently-floading");
      if (!loadingDiv) {
        // Loading div is not present, wait a bit more to ensure UI is ready
        setTimeout(() => {
          if (hasRun) return; // Prevent running if already executed

          // Re-check after a delay to ensure UI is ready
          const contentReady = !appRoot.querySelector("#fluently-loading"); // Assuming no other loading indicators
          if (contentReady) {
            addUi();
            hasRun = true; // Set flag to true after running
            observer.disconnect(); // Stop observing once done
          }
        }, 2000); // Adjust the delay as needed
      }
    }
  }

  // Function to check for the specific button
  function checkForButton() {
    const button = document.querySelector("#jobs-claimed-start-button");
    if (button) {
      // Button is found, start checking for loading div
      checkForLoadingDiv();
      return true; // Stop further checking as we found the button
    }
    return false;
  }

  // Create a new MutationObserver instance
  const observer = new MutationObserver((mutationsList) => {
    for (const mutation of mutationsList) {
      if (mutation.type === "childList") {
        // Call the check function when there are changes in the children
        if (checkForButton()) {
          // Stop observing if the button has been found
          observer.disconnect();
        }
      }
    }
  });

  // Start observing the document body for changes
  observer.observe(document.body, { childList: true, subtree: true });

  // Also check initially in case the element is already present
  if (!checkForButton()) {
    // If button isn't found initially, periodically check for it
    const buttonCheckInterval = setInterval(() => {
      if (checkForButton()) {
        clearInterval(buttonCheckInterval); // Stop checking once the button is found
      }
    }, 500); // Adjust the interval as needed
  }
})();
