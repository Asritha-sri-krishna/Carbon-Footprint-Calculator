// Ensure jsPDF is available globally if using UMD version
// Make sure you include the jsPDF library script in your HTML BEFORE this script.
// Example: <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
const { jsPDF } = window.jspdf;

document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const navButtons = document.querySelectorAll('.nav-button');
    const pages = document.querySelectorAll('.page');
    // In your scripts.js, around line 136-139 (or wherever actionButtons is defined):
// OLD: const actionButtons = document.querySelectorAll('.action-button');
// NEW:
    const actionButtons = document.querySelectorAll('.action-button:not(#downloadReport)'); // Selects all .action-button elements EXCEPT the one with id 'downloadReport'
    const carbonForm = document.getElementById('carbonForm');
    const totalCo2Element = document.getElementById('totalCo2');
    const carbonPieChartDiv = document.getElementById('carbonPieChart');
    const carbonBarChartDiv = document.getElementById('carbonBarChart');
    const tipsList = document.getElementById('tipsList');
    const errorMessagesDiv = document.getElementById('errorMessages');
    const ecoScoreElement = document.getElementById('ecoScore');
    const ecoBadgeElement = document.getElementById('ecoBadge');
    const darkModeToggle = document.getElementById('darkModeToggle');
    const downloadReportBtn = document.getElementById('downloadReport');
    const resultsSection = document.getElementById('resultsSection');
    const pieInteractionInfo = document.getElementById('pieInteractionInfo');

    // --- 1. Emission Factors (Expanded & More Example-Realistic) ---
    const EMISSION_FACTORS = {
        electricity: 0.233,     // kg CO2e per kWh (e.g., average US grid mix)
        driving: 0.17,          // kg CO2e per km (e.g., average gasoline car)
        publicTransport: 0.05,  // kg CO2e per km (e.g., metro/bus average)
        airTravelLongHaul: 800, // kg CO2e per long-haul flight (e.g., >4000km, simplified for demo)
        diet: {
            standard: 2500,
            medium_meat: 1700,
            low_meat: 1200,
            vegetarian: 800,
            vegan: 400
        },
        waste: 0.2, // kg CO2e per kg waste
        water: 0.0003, // kg CO2e per liter water
    };

    // --- 2. D3.js Chart Setup - Global Variables ---
    // Adjusted dimensions for charts to better fit the container CSS (350px is safer for flex item)
    const chartBaseSize = 350; // Use a consistent size for both charts for better layout
    const pieWidth = chartBaseSize;
    const pieHeight = chartBaseSize;
    // Adjusted pieRadius factor to give more room for labels and prevent clipping
    const pieRadius = Math.min(pieWidth, pieHeight) / 2 * 0.7; // Reduced radius for better label visibility

    const pieSvg = d3.select(carbonPieChartDiv)
        .append("svg")
        .attr("width", pieWidth)
        .attr("height", pieHeight)
        .append("g")
        .attr("transform", `translate(${pieWidth / 2}, ${pieHeight / 2})`);

    const color = d3.scaleOrdinal()
        .domain(["Electricity", "Driving", "Public Transport", "Air Travel", "Diet", "Waste", "Water", "No Data"])
        .range(["#4CAF50", "#FFC107", "#03A9F4", "#F44336", "#9C27B0", "#795548", "#2196F3", "#BDBDBD"]);

    const pieGenerator = d3.pie()
        .value(d => d.value)
        .sort(null);

    const arcGenerator = d3.arc()
        .innerRadius(0)
        .outerRadius(pieRadius * 0.8);

    const outerArcGenerator = d3.arc()
        .innerRadius(pieRadius * 0.9)
        .outerRadius(pieRadius * 0.9);

    // Bar Chart
    const barMargin = { top: 20, right: 20, bottom: 60, left: 60 };
    // Use the same base size for consistency in your flex container
    const barTotalWidth = chartBaseSize;
    const barTotalHeight = chartBaseSize;
    const barWidth = barTotalWidth - barMargin.left - barMargin.right;
    const barHeight = barTotalHeight - barMargin.top - barMargin.bottom;

    const barSvg = d3.select(carbonBarChartDiv)
        .append("svg")
        .attr("width", barTotalWidth)
        .attr("height", barTotalHeight)
        .append("g")
        .attr("transform", `translate(${barMargin.left}, ${barMargin.top})`);

    const x = d3.scaleBand()
        .range([0, barWidth]) // Use adjusted barWidth
        .padding(0.1);

    const y = d3.scaleLinear()
        .range([barHeight, 0]); // Use adjusted barHeight

    const xAxis = barSvg.append("g")
        .attr("transform", `translate(0,${barHeight})`);

    const yAxis = barSvg.append("g");

    // --- Tooltip (shared for both charts) ---
    const tooltip = d3.select("body").append("div")
        .attr("class", "tooltip")
        .style("opacity", 0);


    // --- 3. Navigation Logic ---
     function showPage(pageId) {
    console.log("Attempting to show page:", pageId); // Keep this for debugging!

    pages.forEach(page => {
        page.classList.remove('active');
    });

    const targetPage = document.getElementById(pageId); // Get the element first

    if (targetPage) { // Check if the element was found
        targetPage.classList.add('active');
    } else {
        // Log an error if the element isn't found
        console.error(`ERROR: Page with ID "${pageId}" not found in the DOM.`);
    }

    navButtons.forEach(button => {
        if (button.dataset.page === pageId) {
            button.classList.add('active');
        } else {
            button.classList.remove('active');
        }
    });

    if (pageId === 'calculatorPage') {
        calculateAndRender();
    }
}
    // Attach click listeners to navigation buttons
    navButtons.forEach(button => {
        button.addEventListener('click', () => showPage(button.dataset.page));
    });

    // Attach click listeners to action buttons (e.g., Get Started)
    actionButtons.forEach(button => {
        button.addEventListener('click', () => showPage(button.dataset.navigate));
    });

    // --- 4. Core Calculation and Rendering Function (Live Updates) ---
    function calculateAndRender() {
        errorMessagesDiv.style.display = 'none';
        errorMessagesDiv.innerHTML = '';
        tipsList.innerHTML = '';
        pieInteractionInfo.textContent = 'Hover over a slice for details!'; // Reset info

        const electricity = parseFloat(document.getElementById('electricity').value) || 0;
        const driving = parseFloat(document.getElementById('driving').value) || 0;
        const publicTransport = parseFloat(document.getElementById('publicTransport').value) || 0;
        const airTravel = parseFloat(document.getElementById('airTravel').value) || 0;
        const diet = document.getElementById('diet').value;
        const waste = parseFloat(document.getElementById('waste').value) || 0;
        const water = parseFloat(document.getElementById('water').value) || 0;

        let errors = [];
        if (electricity < 0 || driving < 0 || publicTransport < 0 || airTravel < 0 || waste < 0 || water < 0) {
            errors.push("Please enter positive numbers for all inputs.");
        }

        if (errors.length > 0) {
            errorMessagesDiv.innerHTML = errors.join('<br>');
            errorMessagesDiv.style.display = 'block';
            totalCo2Element.textContent = 'N/A';
            ecoScoreElement.textContent = 'N/A';
            ecoBadgeElement.textContent = '';
            // Render "No Data" state for both charts
            const noData = [{ category: "No Data", value: 1 }]; // Dummy value to render a slice
            updatePieChart(noData);
            updateBarChart(noData);
            addTip("Please correct the input errors to see your footprint and tips.");
            return;
        }

        // Calculations for annual emissions based on input timeframes
        const electricityEmissions = (electricity * 12) * EMISSION_FACTORS.electricity; // Monthly to Annual
        const drivingEmissions = driving * EMISSION_FACTORS.driving; // Already Annual
        const publicTransportEmissions = (publicTransport * 52) * EMISSION_FACTORS.publicTransport; // Weekly to Annual
        const airTravelEmissions = airTravel * EMISSION_FACTORS.airTravelLongHaul; // Already Annual
        const dietEmissions = EMISSION_FACTORS.diet[diet]; // Predefined Annual
        const wasteEmissions = (waste * 52) * EMISSION_FACTORS.waste; // Weekly to Annual
        const waterEmissions = (water * 365) * EMISSION_FACTORS.water; // Daily to Annual (assuming daily liters)

        const totalEmissions = electricityEmissions + drivingEmissions + publicTransportEmissions +
                               airTravelEmissions + dietEmissions + wasteEmissions + waterEmissions;

        // Data for D3.js Charts (Filter out categories with 0 or negligible emissions for cleaner charts)
        const data = [
            { category: "Electricity", value: electricityEmissions },
            { category: "Driving", value: drivingEmissions },
            { category: "Public Transport", value: publicTransportEmissions },
            { category: "Air Travel", value: airTravelEmissions },
            { category: "Diet", value: dietEmissions },
            { category: "Waste", value: wasteEmissions },
            { category: "Water", value: waterEmissions }
        ].filter(d => d.value > 0.01); // Filter out negligible values (e.g., less than 0.01 kg CO2e)

        // If all emissions are zero, provide "No Data" for charts
        if (data.length === 0) {
            data.push({ category: "No Data", value: 1 }); // Dummy data to show an empty state in charts
        }

        // Sort data for consistent bar chart order (optional, but good practice)
        data.sort((a, b) => b.value - a.value);

        totalCo2Element.textContent = `${totalEmissions.toFixed(2)} kg CO₂e`;
        updateEcoScore(totalEmissions);
        updatePieChart(data);
        updateBarChart(data); // Call for bar chart
        generateTips(
            { electricity, driving, publicTransport, airTravel, diet, waste, water },
            { electricityEmissions, drivingEmissions, publicTransportEmissions, airTravelEmissions, dietEmissions, wasteEmissions, waterEmissions },
            totalEmissions
        );
    }

    // Attach 'input' and 'change' listeners to all form fields
    document.querySelectorAll('#carbonForm input, #carbonForm select').forEach(input => {
        input.addEventListener('input', calculateAndRender);
        input.addEventListener('change', calculateAndRender);
    });

    // --- 5. D3.js Pie Chart Update Function (with interaction) ---
    function updatePieChart(data) {
        const currentPieData = pieGenerator(data);

        const arcs = pieSvg.selectAll(".arc")
            .data(currentPieData, d => d.data.category);

        // EXIT selection
        arcs.exit()
            .transition().duration(750)
            .attrTween("d", function(d) {
                const interpolate = d3.interpolate(d, { startAngle: d.endAngle, endAngle: d.endAngle });
                return function(t) {
                    return arcGenerator(interpolate(t));
                };
            })
            .remove();

        // UPDATE selection (for existing elements)
        arcs.select("path")
            .transition().duration(750)
            .attrTween("d", function(d) {
                this._current = this._current || d;
                const interpolate = d3.interpolate(this._current, d);
                this._current = interpolate(0);
                return function(t) {
                    return arcGenerator(interpolate(t));
                };
            })
            .attr("fill", d => color(d.data.category));

        // Update text position and content for existing labels
        arcs.select("text")
            .transition().duration(750)
            .attr("transform", d => `translate(${outerArcGenerator.centroid(d)})`)
            .text(d => {
                const total = d3.sum(data, dt => dt.value);
                // Only show label if slice is significant enough (e.g., > 5% of total or if it's the only slice)
                if (total === 0 || (d.data.value / total * 100 < 5 && data.length > 1)) return '';
                return `${d.data.category} (${(d.data.value / total * 100).toFixed(1)}%)`;
            })
            .style("opacity", 1); // Ensure text is visible after update

        // ENTER selection (for new elements)
        const newArcs = arcs.enter().append("g")
            .attr("class", "arc");

        newArcs.append("path")
            .attr("fill", d => color(d.data.category))
            .each(function(d) { this._current = { startAngle: d.startAngle, endAngle: d.startAngle }; })
            .transition().duration(750)
            .attrTween("d", function(d) {
                const i = d3.interpolate(this._current, d);
                return function(t) {
                    return arcGenerator(i(t));
                };
            });

        newArcs.append("text")
            .attr("transform", d => `translate(${outerArcGenerator.centroid(d)})`)
            .attr("dy", ".35em")
            .attr("text-anchor", "middle")
            .text(d => {
                const total = d3.sum(data, dt => dt.value);
                // Only show label if slice is significant enough
                if (total === 0 || (d.data.value / total * 100 < 5 && data.length > 1)) return '';
                return `${d.data.category} (${(d.data.value / total * 100).toFixed(1)}%)`;
            })
            .style("opacity", 0)
            .transition().delay(750).duration(500)
            .style("opacity", 1);

        // --- Pie Chart Interaction ---
        // Re-apply event listeners to all paths (new and existing)
        pieSvg.selectAll("path")
            .on("mouseover", function(event, d) {
                d3.select(this)
                    .transition()
                    .duration(100)
                    .attr("d", arcGenerator.outerRadius(pieRadius * 0.85)); // Make slice slightly bigger

                const total = d3.sum(data, dt => dt.value);
                pieInteractionInfo.textContent =
                    `${d.data.category}: ${d.data.value.toFixed(2)} kg CO₂e ` +
                    `(${total > 0 ? (d.data.value / total * 100).toFixed(1) : 0}%)`;

                tooltip.style("display", "block");
                tooltip.html(`<strong>${d.data.category}:</strong> ${d.data.value.toFixed(2)} kg CO₂e`)
                    .style("left", (event.pageX + 10) + "px")
                    .style("top", (event.pageY - 28) + "px");
            })
            .on("mouseout", function(event, d) {
                d3.select(this)
                    .transition()
                    .duration(100)
                    .attr("d", arcGenerator.outerRadius(pieRadius * 0.8)); // Return to original size

                pieInteractionInfo.textContent = 'Hover over a slice for details!';
                tooltip.style("display", "none");
            });
    }

    // --- 6. D3.js Bar Chart Update Function ---
    function updateBarChart(data) {
        // Update scales based on new data
        x.domain(data.map(d => d.category));
        y.domain([0, d3.max(data, d => d.value) || 1]); // Handle empty/no data case to avoid errors

        // Update X axis
        xAxis.transition().duration(750).call(d3.axisBottom(x))
             .selectAll("text")
                .attr("transform", "translate(-10,0)rotate(-45)")
                .style("text-anchor", "end")
                .attr("class", "bar-label");

        // Update Y axis
        yAxis.transition().duration(750).call(d3.axisLeft(y));

        // Join data with rect elements
        const bars = barSvg.selectAll(".bar")
            .data(data, d => d.category);

        // EXIT selection
        bars.exit()
            .transition().duration(750)
            .attr("y", barHeight)
            .attr("height", 0)
            .remove();

        // UPDATE selection
        bars.transition().duration(750)
            .attr("x", d => x(d.category))
            .attr("y", d => y(d.value))
            .attr("width", x.bandwidth())
            .attr("height", d => barHeight - y(d.value))
            .attr("fill", d => color(d.data ? d.data.category : d.category)); // Ensure category is accessed correctly

        // ENTER selection
        bars.enter().append("rect")
            .attr("class", "bar")
            .attr("x", d => x(d.category))
            .attr("y", barHeight) // Start from bottom
            .attr("width", x.bandwidth())
            .attr("height", 0) // Start with 0 height
            .attr("fill", d => color(d.category))
            .on("mouseover", function(event, d) {
                // Use a slightly darker shade on hover, or a specific hover color from your CSS
                const hoverColor = d3.select('body').classed('dark-mode') ? '#4CAF50' : d3.rgb(color(d.category)).darker(0.8);
                d3.select(this).attr("fill", hoverColor);

                tooltip.style("display", "block");
                tooltip.html(`<strong>${d.category}:</strong> ${d.value.toFixed(2)} kg CO₂e`)
                    .style("left", (event.pageX + 10) + "px")
                    .style("top", (event.pageY - 28) + "px");
            })
            .on("mouseout", function(event, d) {
                d3.select(this).attr("fill", color(d.category)); // Restore original color
                tooltip.style("display", "none");
            })
            .transition().duration(750)
            .attr("y", d => y(d.value))
            .attr("height", d => barHeight - y(d.value));
    }


    // --- 7. Eco Score and Badge Logic ---
    function updateEcoScore(totalEmissions) {
        const maxExpectedEmissions = 8000;
        const minExpectedEmissions = 500;

        const clampedEmissions = Math.max(minExpectedEmissions, Math.min(totalEmissions, maxExpectedEmissions));

        let ecoScore = 100 - ((clampedEmissions - minExpectedEmissions) / (maxExpectedEmissions - minExpectedEmissions)) * 100;
        ecoScore = Math.max(0, Math.min(100, ecoScore));

        ecoScoreElement.textContent = ecoScore.toFixed(0);

        let badge = "";
        let badgeBgColor = '';
        let badgeTextColor = '';

        if (ecoScore >= 90) {
            badge = "🌱 Climate Champion!";
            badgeBgColor = '#d4edda';
            badgeTextColor = '#155724';
        } else if (ecoScore >= 70) {
            badge = "🌿 Eco Warrior";
            badgeBgColor = '#ffeeba';
            badgeTextColor = '#856404';
        } else if (ecoScore >= 40) {
            badge = "🌳 Eco Conscious";
            badgeBgColor = '#cce5ff';
            badgeTextColor = '#004085';
        } else {
            badge = "⚠️ Eco Beginner";
            badgeBgColor = '#f8d7da';
            badgeTextColor = '#721c24';
        }
        ecoBadgeElement.textContent = badge;
        ecoBadgeElement.style.backgroundColor = badgeBgColor;
        ecoBadgeElement.style.color = badgeTextColor;

        // Adjust for dark mode if active
        if (document.body.classList.contains('dark-mode')) {
            if (ecoScore >= 90) {
                ecoBadgeElement.style.backgroundColor = '#28a745'; // Darker green
                ecoBadgeElement.style.color = '#ffffff';
            } else if (ecoScore >= 70) {
                ecoBadgeElement.style.backgroundColor = '#ffc107'; // Yellow
                ecoBadgeElement.style.color = '#343a40';
            } else if (ecoScore >= 40) {
                ecoBadgeElement.style.backgroundColor = '#007bff'; // Blue
                ecoBadgeElement.style.color = '#ffffff';
            } else {
                ecoBadgeElement.style.backgroundColor = '#dc3545'; // Red
                ecoBadgeElement.style.color = '#ffffff';
            }
        }
    }

    // --- 8. Personalized Tips Generation ---
    function generateTips(inputs, emissions, totalEmissions) {
        tipsList.innerHTML = '';

        if (totalEmissions > 0) {
            addTip(`Your estimated annual carbon footprint is ${totalEmissions.toFixed(0)} kg CO₂e. Here's how you can reduce it:`);
        } else {
            addTip("Enter your details to get personalized carbon reduction tips!");
            return;
        }

        if (emissions.electricityEmissions > (EMISSION_FACTORS.electricity * 12 * 350)) {
            addTip(`Your electricity usage is a significant contributor (${emissions.electricityEmissions.toFixed(0)} kg CO₂e). Consider switching to LED bulbs, optimizing heating/cooling, and unplugging idle electronics.`);
        } else if (emissions.electricityEmissions > 0) {
             addTip(`Your electricity emissions are ${emissions.electricityEmissions.toFixed(0)} kg CO₂e. Look into smart thermostats and sustainable energy suppliers if available.`);
        }

        if (emissions.drivingEmissions > (EMISSION_FACTORS.driving * 8000)) {
            addTip(`Driving is a major factor (${emissions.drivingEmissions.toFixed(0)} kg CO₂e). Explore carpooling, public transport, cycling, or walking for shorter distances. Plan errands to combine trips.`);
        } else if (emissions.drivingEmissions > 0) {
            addTip(`Your driving emissions are ${emissions.drivingEmissions.toFixed(0)} kg CO₂e. Regular vehicle maintenance and efficient driving habits can still make a difference.`);
        }

        if (inputs.publicTransport > 0 && emissions.publicTransportEmissions > 0 && inputs.driving > inputs.publicTransport) {
             addTip(`You're using public transport, which is great! To further reduce your footprint, try increasing public transport usage instead of driving where possible.`);
        } else if (inputs.publicTransport === 0 && inputs.driving > 0) {
            addTip(`Consider incorporating public transport into your routine, especially for commutes. It's often a much greener alternative to driving.`);
        }

        if (inputs.airTravel > 0 && emissions.airTravelEmissions > 0) {
            addTip(`Air travel is a high-impact activity (${emissions.airTravelEmissions.toFixed(0)} kg CO₂e). Reduce unnecessary flights, consider train travel for shorter distances, or look for airlines using sustainable aviation fuels.`);
        }

        if (inputs.diet === 'standard' || inputs.diet === 'medium_meat') {
            addTip(`Your diet currently includes significant meat. Reducing red meat, or incorporating more plant-based meals, can significantly lower your dietary carbon footprint.`);
        } else if (inputs.diet === 'low_meat') {
            addTip(`Your low-meat diet is a positive step! Explore more plant-based recipes to further minimize your food-related emissions.`);
        } else if (inputs.diet === 'vegetarian' || inputs.diet === 'vegan') {
            addTip(`Excellent! Your diet is already very low-carbon. Focus on local and seasonal produce to further minimize your impact.`);
        }

        if (emissions.wasteEmissions > (EMISSION_FACTORS.waste * 52 * 4)) {
            addTip(`Your waste generation is notable (${emissions.wasteEmissions.toFixed(0)} kg CO₂e). Focus on the "Reduce, Reuse, Recycle" hierarchy. Compost food waste and avoid single-use plastics.`);
        } else if (emissions.wasteEmissions > 0) {
            addTip(`Your waste emissions are ${emissions.wasteEmissions.toFixed(0)} kg CO₂e. Keep improving by reducing consumption and supporting circular economy initiatives.`);
        }

        if (emissions.waterEmissions > (EMISSION_FACTORS.water * 365 * 200)) {
            addTip(`Your daily water usage is high (${emissions.waterEmissions.toFixed(0)} kg CO₂e). Take shorter showers, fix leaks, and use water-efficient appliances to save both water and energy.`);
        } else if (emissions.waterEmissions > 0) {
            addTip(`Your water emissions are ${emissions.waterEmissions.toFixed(0)} kg CO₂e. Continue to be mindful of your water consumption; every drop counts.`);
        }

        if (tipsList.children.length === 1 && totalEmissions > 0) {
            addTip("You're doing great in many areas! Keep exploring ways to reduce your footprint even further.");
        }
    }

    function addTip(text) {
        const li = document.createElement('li');
        li.textContent = text;
        tipsList.appendChild(li);
    }

    // --- 9. Dark Mode Toggle ---
    darkModeToggle.addEventListener('click', toggleDarkMode);

    function toggleDarkMode() {
        document.body.classList.toggle('dark-mode');
        if (document.body.classList.contains('dark-mode')) {
            localStorage.setItem('darkMode', 'enabled');
        } else {
            localStorage.setItem('darkMode', 'disabled');
        }
        // Re-render charts to pick up potential axis color changes instantly
        calculateAndRender();
    }

    // Check for saved dark mode preference on load
    if (localStorage.getItem('darkMode') === 'enabled') {
        document.body.classList.add('dark-mode');
    }

    // --- 10. Download Report Function (PDF) ---
    downloadReportBtn.addEventListener('click', downloadPdfReport);

    async function downloadPdfReport() {
        // Temporarily hide elements that shouldn't be in the screenshot but are part of the page layout
        downloadReportBtn.style.display = 'none';
        navButtons.forEach(btn => btn.style.display = 'none'); // Hide nav buttons
        darkModeToggle.style.display = 'none'; // Hide dark mode toggle

        // Store original styles to revert later
        const originalResultsWidth = resultsSection.style.width;
        const originalResultsMargin = resultsSection.style.margin;
        const originalResultsBoxShadow = resultsSection.style.boxShadow;
        const originalResultsBgColor = resultsSection.style.backgroundColor;
        const originalBodyBgColor = document.body.style.backgroundColor;
        const originalBodyColor = document.body.style.color;

        // Apply temporary styles for better html2canvas capture
        // Force specific styles to ensure consistent appearance in PDF, especially for dark mode
        resultsSection.style.width = '700px'; // A good width for A4 portrait layout
        resultsSection.style.margin = '20px auto'; // Center it
        resultsSection.style.boxShadow = 'none'; // Remove shadow to avoid artifacts
        resultsSection.style.backgroundColor = '#ffffff'; // Force white background for print
        resultsSection.style.color = '#333'; // Force dark text for print
        document.body.style.backgroundColor = '#ffffff'; // Ensure white background for the whole capture area
        document.body.style.color = '#333'; // Ensure dark text for body elements

        // Give a brief moment for CSS changes to apply
        await new Promise(resolve => setTimeout(resolve, 100)); // Increased delay for more reliable rendering

        // Use html2canvas to render the results section
        try {
            console.log("Attempting to capture results section with html2canvas...");
            const canvas = await html2canvas(resultsSection, {
                scale: 2, // Increase scale for better quality in PDF
                useCORS: true, // Crucial if images/fonts are from other domains
                logging: true, // Enable logging to see html2canvas messages in console
                backgroundColor: null, // Let the background be transparent for the element itself, relying on body's temp white bg
                removeContainer: true // Clean up the temporary container created by html2canvas
            });
            console.log("html2canvas capture successful, canvas generated.");

            const imgData = canvas.toDataURL('image/png');
            console.log("Canvas converted to image data URL. Length:", imgData.length);

            // Initialize jsPDF
            const pdf = new jsPDF('p', 'mm', 'a4'); // 'p' for portrait, 'mm' for millimeters, 'a4' page size

            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = pdf.internal.pageSize.getHeight();
            const imgAspectRatio = canvas.width / canvas.height;

            // Calculate image dimensions to fit within PDF with margins
            const margin = 15; // 15mm margin on each side
            let imgPdfWidth = pdfWidth - (2 * margin);
            let imgPdfHeight = imgPdfWidth / imgAspectRatio;

            // If the image is taller than a single page, scale it down to fit height
            // or consider adding pages if content is very long (more advanced)
            if (imgPdfHeight > pdfHeight - (2 * margin)) {
                imgPdfHeight = pdfHeight - (2 * margin);
                imgPdfWidth = imgPdfHeight * imgAspectRatio;
            }

            // Calculate x and y position to center the image on the PDF page
            const xOffset = (pdfWidth - imgPdfWidth) / 2;
            const yOffset = (pdfHeight - imgPdfHeight) / 2;

            pdf.addImage(imgData, 'PNG', xOffset, yOffset, imgPdfWidth, imgPdfHeight);
            pdf.save('carbon_footprint_report.pdf');
            console.log("PDF generated and saved successfully!");

        } catch (error) {
            console.error("Error generating PDF:", error);
            alert("Failed to generate PDF report. Please try again or check your browser's console for errors.");
        } finally {
            // Restore original styles and visibility regardless of success or failure
            downloadReportBtn.style.display = 'block';
            navButtons.forEach(btn => btn.style.display = 'block');
            darkModeToggle.style.display = 'block';

            resultsSection.style.width = originalResultsWidth;
            resultsSection.style.margin = originalResultsMargin;
            resultsSection.style.boxShadow = originalResultsBoxShadow;
            resultsSection.style.backgroundColor = originalResultsBgColor;
            resultsSection.style.color = ''; // Remove forced color

            document.body.style.backgroundColor = originalBodyBgColor;
            document.body.style.color = originalBodyColor;

            // Re-apply dark mode if it was active
            if (localStorage.getItem('darkMode') === 'enabled') {
                document.body.classList.add('dark-mode');
            }
        }
    }


    // --- Initial Load ---
    showPage('welcomePage'); // Show the welcome page initially
    // Also trigger initial render for charts if on calculator page by default,
    // though showPage already handles this if 'calculatorPage' is the initial page.
    // If you want charts to always render immediately even if not on calc page, call it here:
    // calculateAndRender();
});
