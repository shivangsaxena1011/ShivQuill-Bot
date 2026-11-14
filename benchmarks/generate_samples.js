import fs from 'fs';
import path from 'path';

const categories = [
  {
    name: 'academic',
    count: 30,
    generator: (i) => ({
      id: `acad-${i + 1}`,
      category: 'academic',
      text: `Empirical observations in cohort ${i + 1} demonstrate that metabolic variances correlate significantly with cellular respiration metrics (Smith et al., 202${i % 4}, p. ${100 + i}). A two-tailed t-test revealed p < 0.0${(i % 5) + 1}, establishing quantitative significance across the sample population.`,
      preserves: [`cohort ${i + 1}`, `Smith et al., 202${i % 4}`, `p < 0.0${(i % 5) + 1}`]
    })
  },
  {
    name: 'casual',
    count: 25,
    generator: (i) => ({
      id: `cas-${i + 1}`,
      category: 'casual',
      text: `Hey guys, just wanted to check in about the party on Saturday at 7:30 PM. Let me know if you can bring snacks or drinks, otherwise I'll grab some from Costco near 5th Avenue.`,
      preserves: ['Saturday', '7:30 PM', 'Costco', '5th Avenue']
    })
  },
  {
    name: 'email',
    count: 25,
    generator: (i) => ({
      id: `email-${i + 1}`,
      category: 'email',
      text: `Dear Dr. Martinez, I am writing to follow up on project proposal #${1000 + i}. We have finalized the quarterly budget at $${50000 + i * 500} and would appreciate your approval before Friday, November ${15 + (i % 10)}, 2026. Sincerely, Alex Johnson.`,
      preserves: ['Dr. Martinez', `#${1000 + i}`, `$${50000 + i * 500}`, '2026', 'Alex Johnson']
    })
  },
  {
    name: 'technical',
    count: 25,
    generator: (i) => ({
      id: `tech-${i + 1}`,
      category: 'technical',
      text: `The distributed cluster runs Kubernetes v1.3${i % 4} with ${4 + (i % 8)} replica nodes. When throughput exceeds ${1000 * (i + 1)} req/sec, Prometheus alerts trigger the Horizontal Pod Autoscaler to spin up additional microservice instances in us-east-${(i % 2) + 1}.`,
      preserves: [`Kubernetes v1.3${i % 4}`, `${4 + (i % 8)} replica nodes`, 'Prometheus', `us-east-${(i % 2) + 1}`]
    })
  },
  {
    name: 'research',
    count: 20,
    generator: (i) => ({
      id: `res-${i + 1}`,
      category: 'research',
      text: `CRISPR-Cas9 endonuclease complexes targeting locus rs${100000 + i} on chromosome ${1 + (i % 22)} exhibited a cleavage efficiency of ${80 + (i % 15)}%. As documented by Zhang & Patel (2024), off-target mutagenesis remained beneath 0.02% at 37.0°C.`,
      preserves: ['CRISPR-Cas9', `rs${100000 + i}`, 'Zhang & Patel (2024)', '37.0°C']
    })
  },
  {
    name: 'grammar_errors',
    count: 25,
    generator: (i) => ({
      id: `gram-${i + 1}`,
      category: 'grammar_errors',
      text: `Teh results of the experiment was completely unexpected because nobody have checked teh calibration settings on machine #${i + 1}.`,
      preserves: [`machine #${i + 1}`],
      expectedErrors: ['teh', 'was', 'have']
    })
  },
  {
    name: 'long_paragraphs',
    count: 15,
    generator: (i) => ({
      id: `long-${i + 1}`,
      category: 'long_paragraphs',
      text: `The transition toward sustainable energy infrastructure represents a monumental challenge for municipal administrations in region ${i + 1}. Initial capital expenditures for photovoltaic arrays and grid-scale lithium-ion battery storage systems frequently exceed $${10 + i}.5 million. Nevertheless, long-term operational savings coupled with regulatory carbon credit incentives yield a projected return on investment within 7.5 years. Public-private partnerships formed in early 2025 have demonstrated that municipal solar integration decreases grid vulnerability during extreme weather events, while simultaneously driving localized economic development through skilled electrical engineering employment opportunities across all contiguous counties.`,
      preserves: [`region ${i + 1}`, `$${10 + i}.5 million`, '7.5 years', '2025']
    })
  },
  {
    name: 'multi_paragraph',
    count: 15,
    generator: (i) => ({
      id: `multi-${i + 1}`,
      category: 'multi_paragraph',
      text: `Decentralized finance protocols experienced rapid liquidity influx throughout Q${(i % 4) + 1} 2026. Automated market makers facilitated over $${100 + i * 10}M in daily settlement volume across Layer-2 rollups.\n\nHowever, smart contract auditing standards must be tightened. Vulnerabilities in reentrancy guards and oracle price feeds accounted for the majority of security incidents recorded by PeckShield in their annual 2025 retrospective.`,
      preserves: [`Q${(i % 4) + 1} 2026`, `$${100 + i * 10}M`, 'PeckShield', '2025']
    })
  },
  {
    name: 'citations_and_dates',
    count: 20,
    generator: (i) => ({
      id: `cite-${i + 1}`,
      category: 'citations_and_dates',
      text: `According to the World Health Organization report published on March ${10 + (i % 15)}, 2026, global cardiovascular mortality decreased by ${3 + (i % 5)}% following dietary sodium reductions (WHO Technical Report Series, No. ${900 + i}). These findings substantiate earlier hypotheses proposed by Henderson (2023).`,
      preserves: [`March ${10 + (i % 15)}, 2026`, `${3 + (i % 5)}%`, `No. ${900 + i}`, 'Henderson (2023)']
    })
  }
];

const allSamples = [];
for (const cat of categories) {
  for (let i = 0; i < cat.count; i++) {
    allSamples.push(cat.generator(i));
  }
}

console.log(`Generated ${allSamples.length} synthetic writing samples.`);
fs.writeFileSync(path.resolve('benchmarks/samples.json'), JSON.stringify(allSamples, null, 2), 'utf-8');
