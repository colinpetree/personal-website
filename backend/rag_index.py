import hashlib
import json
import math
import os
import re
import threading
from collections import Counter

# A fixed, canned sample document for the RAG demo card. This is the real published
# paper "Moderated estimation of fold change and dispersion for RNA-seq data with
# DESeq2" by Love, Huber & Anders, Genome Biology 15:550 (2014),
# https://doi.org/10.1186/s13059-014-0550-8 - licensed CC BY 4.0
# (https://creativecommons.org/licenses/by/4.0/), so redistribution and reuse are
# explicitly permitted with attribution (see RagPage.jsx's info panel for the citation
# shown to visitors, and the /api/ai-demo/rag/source.pdf route for the original PDF).
# Text below is excerpted and re-typed from the PDF - the heavy equation-based Methods
# section and the reference list are omitted since they don't survive PDF text
# extraction as clean prose and add little to a retrieval demo. Chunking is
# fixed-size/character-based rather than markdown-header-based, so this same pipeline
# works unchanged if the source document is ever swapped for a different PDF.
SAMPLE_DOCUMENT = """Moderated estimation of fold change and dispersion for RNA-seq data with DESeq2
Michael I Love, Wolfgang Huber and Simon Anders. Genome Biology (2014) 15:550.

Abstract. In comparative high-throughput sequencing assays, a fundamental task is the analysis of count data, such as read counts per gene in RNA-seq, for evidence of systematic changes across experimental conditions. Small replicate numbers, discreteness, large dynamic range and the presence of outliers require a suitable statistical approach. We present DESeq2, a method for differential analysis of count data, using shrinkage estimation for dispersions and fold changes to improve stability and interpretability of estimates. This enables a more quantitative analysis focused on the strength rather than the mere presence of differential expression. The DESeq2 package is available at http://www.bioconductor.org/packages/release/bioc/html/DESeq2.html.

Background. The rapid adoption of high-throughput sequencing (HTS) technologies for genomic studies has resulted in a need for statistical methods to assess quantitative differences between experiments. An important task here is the analysis of RNA sequencing (RNA-seq) data with the aim of finding genes that are differentially expressed across groups of samples. This task is general: methods for it are typically also applicable for other comparative HTS assays, including chromatin immunoprecipitation sequencing, chromosome conformation capture, or counting observed taxa in metagenomic studies.

Besides the need to account for the specifics of count data, such as non-normality and a dependence of the variance on the mean, a core challenge is the small number of samples in typical HTS experiments, often as few as two or three replicates per condition. Inferential methods that treat each gene separately suffer here from lack of power, due to the high uncertainty of within-group variance estimates. In high-throughput assays, this limitation can be overcome by pooling information across genes, specifically, by exploiting assumptions about the similarity of the variances of different genes measured in the same experiment.

Many methods for differential expression analysis of RNA-seq data perform such information sharing across genes for variance (or, equivalently, dispersion) estimation. edgeR moderates the dispersion estimate for each gene toward a common estimate across all genes, or toward a local estimate from genes with similar expression strength, using a weighted conditional likelihood. Our DESeq method detects and corrects dispersion estimates that are too low through modeling of the dependence of the dispersion on the average expression strength over all samples. BBSeq models the dispersion on the mean, with the mean absolute deviation of dispersion estimates used to reduce the influence of outliers. DSS uses a Bayesian approach to provide an estimate for the dispersion for individual genes that accounts for the heterogeneity of dispersion values for different genes. baySeq and ShrinkBayes estimate priors for a Bayesian model over all genes, and then provide posterior probabilities or false discovery rates (FDRs) for differential expression.

The most common approach in the comparative analysis of transcriptomics data is to test the null hypothesis that the logarithmic fold change (LFC) between treatment and control for a gene's expression is exactly zero, i.e., that the gene is not at all affected by the treatment. Often the goal of differential analysis is to produce a list of genes passing multiple-test adjustment, ranked by P value. However, small changes, even if statistically highly significant, might not be the most interesting candidates for further investigation. Ranking by fold change, on the other hand, is complicated by the noisiness of LFC estimates for genes with low counts. Furthermore, the number of genes called significantly differentially expressed depends as much on the sample size and other aspects of experimental design as it does on the biology of the experiment, and well-powered experiments often generate an overwhelmingly long list of hits. We, therefore, developed a statistical framework to facilitate gene ranking and visualization based on stable estimation of effect sizes (LFCs), as well as testing of differential expression with respect to user-defined thresholds of biological significance.

Here we present DESeq2, a successor to our DESeq method. DESeq2 integrates methodological advances with several novel features to facilitate a more quantitative analysis of comparative RNA-seq data using shrinkage estimators for dispersion and fold change. We demonstrate the advantages of DESeq2's new features by describing a number of applications possible with shrunken fold changes and their estimates of standard error, including improved gene ranking and visualization, hypothesis tests above and below a threshold, and the regularized logarithm transformation for quality assessment and clustering of overdispersed count data. We furthermore compare DESeq2's statistical power with existing tools, revealing that our methodology has high sensitivity and precision, while controlling the false positive rate. DESeq2 is available as an R/Bioconductor package.

Model and normalization. The starting point of a DESeq2 analysis is a count matrix K with one row for each gene i and one column for each sample j. The matrix entries Kij indicate the number of sequencing reads that have been unambiguously mapped to a gene in a sample. For each gene, we fit a generalized linear model (GLM). We model read counts Kij as following a negative binomial distribution (sometimes also called a gamma-Poisson distribution) with mean and dispersion. The mean is taken as a quantity proportional to the concentration of cDNA fragments from the gene in the sample, scaled by a normalization factor, accounting for differences in sequencing depth between samples. To estimate these size factors, the DESeq2 package offers the median-of-ratios method already used in DESeq. We use GLMs with a logarithmic link. In the simplest case of a comparison between two groups, such as treated and control samples, the GLM fit returns coefficients indicating the overall expression strength of the gene and the log2 fold change between treatment and control. The use of linear models, however, provides the flexibility to also analyze more complex designs, as is often useful in genomic studies.

Empirical Bayes shrinkage for dispersion estimation. Within-group variability, i.e., the variability between replicates, is modeled by the dispersion parameter. Accurate estimation of the dispersion parameter is critical for the statistical inference of differential expression. For studies with large sample sizes this is usually not a problem. For controlled experiments, however, sample sizes tend to be smaller (experimental designs with as little as two or three replicates are common and reasonable), resulting in highly variable dispersion estimates for each gene. If used directly, these noisy estimates would compromise the accuracy of differential expression testing. One sensible solution is to share information across genes. In DESeq2, we assume that genes of similar average expression strength have similar dispersion. We first treat each gene separately and estimate gene-wise dispersion estimates using maximum likelihood, which rely only on the data of each individual gene. Next, we determine the location parameter of the distribution of these estimates by fitting a smooth curve to allow for dependence on average expression strength. This provides an accurate estimate for the expected dispersion value for genes of a given expression strength. We then shrink the gene-wise dispersion estimates toward the values predicted by the curve to obtain final dispersion values. We use an empirical Bayes approach, which lets the strength of shrinkage depend on an estimate of how close true dispersion values tend to be to the fit and on the degrees of freedom: as the sample size increases, the shrinkage decreases in strength, and eventually becomes negligible.

Note that a number of genes with gene-wise dispersion estimates below the curve have their final estimates raised substantially. The shrinkage procedure thereby helps avoid potential false positives, which can result from underestimates of dispersion. If, on the other hand, an individual gene's dispersion is far above the distribution of the gene-wise dispersion estimates of other genes, then the shrinkage would lead to a greatly reduced final estimate of dispersion. We reasoned that in many cases, the reason for extraordinarily high dispersion of a gene is that it does not obey our modeling assumptions; some genes may show much higher variability than others for biological or technical reasons, even though they have the same average expression levels. DESeq2 handles these cases by using the gene-wise estimate instead of the shrunken estimate when the former is more than 2 residual standard deviations above the curve, treating such genes as dispersion outliers.

Empirical Bayes shrinkage for fold-change estimation. A common difficulty in the analysis of HTS data is the strong variance of LFC estimates for genes with low read count. Weakly expressed genes seem to show much stronger differences between compared groups than strongly expressed genes. This phenomenon, seen in most HTS datasets, is a direct consequence of dealing with count data, in which ratios are inherently noisier when counts are low. This heteroskedasticity complicates downstream analysis and data interpretation, as it makes effect sizes difficult to compare across the dynamic range of the data. DESeq2 overcomes this issue by shrinking LFC estimates toward zero in a manner such that shrinkage is stronger when the available information for a gene is low, which may be because counts are low, dispersion is high or there are few degrees of freedom. We again employ an empirical Bayes procedure: we first perform ordinary GLM fits to obtain maximum-likelihood estimates for the LFCs and then fit a zero-centered normal distribution to the observed distribution of these estimates over all genes. This distribution is used as a prior on LFCs in a second round of GLM fits, and the resulting maximum a posteriori estimates are kept as final estimates of LFC.

The resulting shrunken LFCs are biased toward zero in a manner that removes the problem of exaggerated LFCs for low counts. The strongest LFCs are no longer exhibited by genes with weakest expression. Rather, the estimates are more evenly spread around zero, and for very weakly expressed genes, LFCs hardly deviate from zero, reflecting that accurate LFC estimates are not possible here. The strength of shrinkage does not depend simply on the mean count, but rather on the amount of information available for the fold change estimation. Two genes with equal expression strength but different dispersions will experience a different amount of shrinkage. The shrinkage of LFC estimates can be described as a bias-variance trade-off: for genes with little information for LFC estimation, a reduction of the strong variance is bought at the cost of accepting a bias toward zero, and this can result in an overall reduction in mean squared error. The shrunken LFCs offer a more reproducible quantification of transcriptional differences than standard maximum-likelihood LFCs, and are also suitable for ranking genes, e.g., to prioritize them for follow-up experiments.

Hypothesis tests for differential expression. After GLMs are fit for each gene, one may test whether each model coefficient differs significantly from zero. DESeq2 reports the standard error for each shrunken LFC estimate, obtained from the curvature of the coefficient's posterior at its maximum. For significance testing, DESeq2 uses a Wald test: the shrunken estimate of LFC is divided by its standard error, resulting in a z-statistic, which is compared to a standard normal distribution. The Wald test allows testing of individual coefficients, or contrasts of coefficients, without the need to fit a reduced model as with the likelihood ratio test, though the likelihood ratio test is also available as an option in DESeq2. The Wald test P values from the subset of genes that pass an independent filtering step are adjusted for multiple testing using the procedure of Benjamini and Hochberg.

Automatic independent filtering. Due to the large number of tests performed in the analysis of RNA-seq and other genome-wide experiments, the multiple testing problem needs to be addressed. A popular objective is control or estimation of the FDR. Multiple testing adjustment tends to be associated with a loss of power. However, the loss can be reduced if genes that have little or no chance of being detected as differentially expressed are omitted from the testing, provided that the criterion for omission is independent of the test statistic under the null hypothesis. DESeq2 uses the average expression strength of each gene, across all samples, as its filter criterion, and it omits all genes with mean normalized counts below a filtering threshold from multiple testing adjustment. DESeq2 by default will choose a threshold that maximizes the number of genes found at a user-specified target FDR. Depending on the distribution of the mean normalized counts, the resulting increase in power can be substantial, sometimes making the difference in whether or not any differentially expressed genes are detected.

Hypothesis tests with thresholds on effect size. Most approaches to testing for differential expression, including the default approach of DESeq2, test against the null hypothesis of zero LFC. However, with sufficient sample size, even genes with a very small but non-zero LFC will eventually be detected as differentially expressed. A change should therefore be of sufficient magnitude to be considered biologically significant. DESeq2 offers tests for composite null hypotheses of the form that the absolute LFC is below some threshold theta, so that to reach significance, the estimated LFC has to exceed the specified threshold by an amount that depends on the available information. Sometimes, a researcher is interested in finding genes that are not, or only very weakly, affected by the treatment or experimental condition. For such analyses, DESeq2 offers a test of the composite null hypothesis that the absolute LFC is at least theta, which will report genes as significant for which there is evidence that their LFC is weaker than theta. Note the lack of LFC shrinkage in this case: to find genes with weak differential expression, DESeq2 requires that the LFC shrinkage has been disabled, because the zero-centered prior used for LFC shrinkage embodies a prior belief that LFCs tend to be small, and hence is inappropriate here.

Detection of count outliers. Parametric methods for detecting differential expression can have gene-wise estimates of LFC overly influenced by individual outliers that do not fit the distributional assumptions of the model. An example of such an outlier would be a gene with single-digit counts for all samples, except one sample with a count in the thousands. As the aim of differential expression analysis is typically to find consistently up- or down-regulated genes, it is useful to consider diagnostics for detecting individual observations that overly influence the LFC estimate and P value for a gene. A standard outlier diagnostic is Cook's distance, which is defined within each gene for each sample as the scaled distance that the coefficient vector of a linear model or GLM would move if the sample were removed and the model refit. DESeq2 flags, for each gene, those samples that have a Cook's distance greater than the 0.99 quantile of the relevant F distribution. However, if there are two or fewer replicates for a condition, these samples do not contribute to outlier detection, as there are insufficient replicates to determine outlier status.

How should one deal with flagged outliers? In an experiment with many replicates, discarding the outlier and proceeding with the remaining data might make best use of the available data. In a small experiment with few samples, however, the presence of an outlier can impair inference regarding the affected gene, and merely ignoring the outlier may even be considered data cherry-picking, and therefore, it is more prudent to exclude the whole gene from downstream analysis. Hence, DESeq2 offers two possible responses to flagged outliers. By default, outliers in conditions with six or fewer replicates cause the whole gene to be flagged and removed from subsequent analysis, including P value adjustment for multiple testing. For conditions that contain seven or more replicates, DESeq2 replaces the outlier counts with an imputed value, namely the trimmed mean over all samples, scaled by the size factor, and then re-estimates the dispersion, LFCs and P values for these genes. As the outlier is replaced with the value predicted by the null hypothesis of no differential expression, this is a more conservative choice than simply omitting the outlier.

Regularized logarithm transformation. For certain analyses, it is useful to transform data to render them homoskedastic, for example when assessing sample similarities in an unsupervised manner using a clustering or ordination algorithm. For RNA-seq data, if the data are given to such an algorithm on the original count scale, the result will be dominated by highly expressed, highly variable genes; if logarithm-transformed data are used, undue weight will be given to weakly expressed genes, which show exaggerated LFCs. Therefore, we use the shrinkage approach of DESeq2 to implement a regularized logarithm transformation (rlog), which behaves similarly to a log2 transformation for genes with high counts, while shrinking together the values for different samples for genes with low counts. It therefore avoids a commonly observed property of the standard logarithm transformation, the spreading apart of data for genes with low counts, where random noise is likely to dominate any biologically meaningful signal. It thus facilitates multivariate visualization and ordinations such as clustering or principal component analysis that tend to work best when the variables have similar dynamic range. We demonstrated the use of the rlog transformation on an RNA-seq dataset from rat dorsal root ganglion tissue, showing that the rlog both stabilizes the variance through the range of the mean of counts and helps to find meaningful patterns in the data, producing a hierarchical clustering that recovers the treatment and time groups more cleanly than an ordinary logarithm transformation does.

Gene-level analysis. We here present DESeq2 for the analysis of per-gene counts, i.e., the total number of reads that can be uniquely assigned to a gene. In contrast, several algorithms work with probabilistic assignments of reads to transcripts, where multiple, overlapping transcripts can originate from each gene. It has been noted that the total read count approach can result in false detection of differential expression when in fact only transcript isoform lengths change. However, in our benchmark we found that LFC sign disagreements between total read count and probabilistic-assignment-based methods were rare for genes that were differentially expressed according to either method. Furthermore, if estimates for average transcript length are available for the conditions, these can be incorporated into the DESeq2 framework as gene- and sample-specific normalization factors. In addition, the approach used in DESeq2 can be extended to isoform-specific analysis, either through generalized linear modeling at the exon level with a gene-specific mean as in the DEXSeq package or through counting evidence for alternative isoforms in splice graphs. In fact, the latest release version of DEXSeq now uses DESeq2 as its inferential engine.

Comparative benchmarks. To assess how well DESeq2 performs for standard analyses in comparison to other current methods, we used a combination of simulations and real data. The negative-binomial-based approaches compared were DESeq (old), edgeR, edgeR with the robust option, DSS and EBSeq. Other methods compared were the voom normalization method followed by linear modeling using the limma package and the SAMseq permutation method of the samr package. For the benchmarks using real data, the Cuffdiff 2 method of the Cufflinks suite was included.

Benchmarks through simulation: sensitivity and precision. We simulated datasets of 10,000 genes with negative binomial distributed counts, with means and dispersions drawn from the joint distribution of means and gene-wise dispersion estimates from a real dataset. These datasets were of varying total sample size, and the samples were split into two equal-sized groups; 80% of the simulated genes had no true differential expression, while for 20% of the genes, true fold changes of 2, 3 and 4 were used to generate counts across the two groups. Algorithms' performance in the simulation benchmark was assessed by their sensitivity and precision. DESeq2, and also edgeR, often had the highest sensitivity of the algorithms that controlled type-I error, in the sense that the actual FDR was at or below the nominal threshold used for calling differentially expressed genes. DESeq2 had higher sensitivity compared to the other algorithms, particularly for small fold change (2 or 3). The overly conservative calling of the old DESeq tool can be observed, with reduced sensitivity compared to the other algorithms and an actual FDR less than the nominal value.

Outlier sensitivity. We used simulations to compare the sensitivity and specificity of DESeq2's outlier handling approach to that of edgeR, which was recently added to the software and published while this manuscript was under review. edgeR now includes an optional method to handle outliers by iteratively refitting the GLM after down-weighting potential outlier counts. The simulations indicated that both approaches to outliers nearly recover the performance on an outlier-free dataset, though edgeR-robust had slightly higher actual than nominal FDR.

Precision of fold change estimates. We benchmarked the DESeq2 approach of using an empirical prior to achieve shrinkage of LFC estimates against two competing approaches: the GFOLD method, which can analyze experiments without replication and can also handle experiments with replicates, and the edgeR package, which provides a pseudocount-based shrinkage termed predictive LFCs. DESeq2 had consistently low root-mean-square error and mean absolute error across a range of sample sizes and models for a distribution of true LFCs. GFOLD had similarly low error to DESeq2 over all genes; however, when focusing on differentially expressed genes, it performed worse for larger sample sizes. edgeR with default settings had similarly low error to DESeq2 when focusing only on the differentially expressed genes, but had higher error over all genes.

Clustering. We compared the performance of the rlog transformation against other methods of transformation or distance calculation in the recovery of simulated clusters, using the adjusted Rand index to compare a hierarchical clustering based on various distances with the true cluster membership. The results revealed that when the size factors were equal for all samples, the Poisson distance and the Euclidean distance of rlog-transformed or variance-stabilizing-transformed counts outperformed other methods. However, when the size factors were not equal across samples, the rlog approach generally outperformed the other methods.

Benchmark for RNA sequencing data: false positive rate. While simulation is useful to verify how well an algorithm behaves with idealized theoretical data, simulations cannot inform us how well the theory fits reality. To evaluate the false positive rate of the algorithms, we considered mock comparisons from a dataset with many samples and no known condition dividing the samples into distinct groups, using RNA-seq data for lymphoblastoid cell lines derived from unrelated Nigerian individuals. The results indicated that all algorithms generally controlled the number of false positives. DESeq (old) and Cuffdiff 2 appeared overly conservative in this analysis, not using up their type-I error budget.

Sensitivity, estimated from experimental reproducibility. To obtain an impression of the sensitivity of the algorithms, we considered a mouse strain dataset containing ten and eleven replicates of two different, genetically homogeneous strains, allowing a split into an evaluation set and a larger verification set, repeated across many random splits. The ranking of algorithms was generally consistent regardless of which algorithm was chosen to determine calls in the verification set. DESeq2 had comparable sensitivity to edgeR and voom though less than DSS.

Precision, estimated from experimental reproducibility. Another important consideration from the perspective of an investigator is the precision, or fraction of true positives in the set of genes which pass the adjusted P value threshold. DESeq2 often had the second highest median precision, behind DESeq (old). We can also see that algorithms with higher median sensitivity, e.g., DSS, were generally associated here with lower median precision. In summary, the benchmarking tests showed that DESeq2 effectively controlled type-I errors, maintaining a median false positive rate just below the chosen critical value in a mock comparison of groups of samples randomly chosen from a larger pool. For both simulation and analysis of real data, DESeq2 often achieved the highest sensitivity of those algorithms that controlled the FDR.

Conclusions. DESeq2 offers a comprehensive and general solution for gene-level analysis of RNA-seq data. Shrinkage estimators substantially improve the stability and reproducibility of analysis results compared to maximum-likelihood-based solutions. Empirical Bayes priors provide automatic control of the amount of shrinkage based on the amount of information for the estimated quantity available in the data. This allows DESeq2 to offer consistent performance over a large range of data types and makes it applicable for small studies with few replicates as well as for large observational studies. DESeq2's heuristics for outlier detection help to recognize genes for which the modeling assumptions are unsuitable and so avoids type-I errors caused by these. The embedding of these strategies in the framework of GLMs enables the treatment of both simple and complex designs.

A critical advance is the shrinkage estimator for fold changes for differential expression analysis, which offers a sound and statistically well-founded solution to the practically relevant problem of comparing fold change across the wide dynamic range of RNA-seq experiments. This is of value for many downstream analysis tasks, including the ranking of genes for follow-up studies and association of fold changes with other variables of interest. In addition, the rlog transformation, which implements shrinkage of fold changes on a per-sample basis, facilitates visualization of differences, for example in heat maps, and enables the application of a wide range of techniques that require homoskedastic input data, including machine-learning or ordination techniques such as principal component analysis and clustering.

DESeq2 hence offers to practitioners a wide set of features with state-of-the-art inferential power. Its use cases are not limited to RNA-seq data or other transcriptomics assays; rather, many kinds of high-throughput count data can be used. Other areas for which DESeq or DESeq2 have been used include chromatin immunoprecipitation sequencing assays, barcode-based assays, metagenomics data, ribosome profiling and CRISPR/Cas library assays. Finally, the DESeq2 package is integrated well in the Bioconductor infrastructure and comes with extensive documentation, including a vignette that demonstrates a complete analysis step by step and discusses advanced use cases.
"""

CHUNK_SIZE = 500
CHUNK_OVERLAP = 150


def chunk_by_char(text, chunk_size=CHUNK_SIZE, chunk_overlap=CHUNK_OVERLAP):
    text = text.strip()
    chunks = []
    start = 0
    while start < len(text):
        end = min(start + chunk_size, len(text))
        chunks.append(text[start:end].strip())
        start = end - chunk_overlap if end < len(text) else len(text)
    return [c for c in chunks if c]


class VectorIndex:
    def __init__(self, distance_metric='cosine', embedding_fn=None):
        self.vectors = []
        self.documents = []
        self._vector_dim = None
        if distance_metric not in ('cosine', 'euclidean'):
            raise ValueError("distance_metric must be 'cosine' or 'euclidean'")
        self._distance_metric = distance_metric
        self._embedding_fn = embedding_fn

    def add_documents(self, documents):
        if not self._embedding_fn:
            raise ValueError('Embedding function not provided during initialization.')
        contents = [d['content'] for d in documents]
        vectors = self._embedding_fn(contents, input_type='document')
        for vector, document in zip(vectors, documents):
            self.add_vector(vector, document)

    def add_vector(self, vector, document):
        if not self.vectors:
            self._vector_dim = len(vector)
        elif len(vector) != self._vector_dim:
            raise ValueError(f'Inconsistent vector dimension. Expected {self._vector_dim}, got {len(vector)}')
        self.vectors.append(list(vector))
        self.documents.append(document)

    def search(self, query_vector, k=1):
        if not self.vectors:
            return []
        if len(query_vector) != self._vector_dim:
            # zip() would otherwise silently truncate to the shorter vector on a
            # dimension mismatch instead of raising, producing wrong-but-plausible
            # rankings with no error - e.g. if a cache file ever ends up holding
            # vectors from a different embedding model than the live one in use.
            raise ValueError(f'Query vector dimension mismatch. Expected {self._vector_dim}, got {len(query_vector)}')
        dist_func = self._cosine_distance if self._distance_metric == 'cosine' else self._euclidean_distance
        distances = [(dist_func(query_vector, v), doc) for v, doc in zip(self.vectors, self.documents)]
        distances.sort(key=lambda item: item[0])
        return [(doc, dist) for dist, doc in distances[:k]]

    def _euclidean_distance(self, vec1, vec2):
        return math.sqrt(sum((p - q) ** 2 for p, q in zip(vec1, vec2)))

    def _magnitude(self, vec):
        return math.sqrt(sum(x * x for x in vec))

    def _cosine_distance(self, vec1, vec2):
        mag1, mag2 = self._magnitude(vec1), self._magnitude(vec2)
        if mag1 == 0 and mag2 == 0:
            return 0.0
        if mag1 == 0 or mag2 == 0:
            return 1.0
        dot = sum(p * q for p, q in zip(vec1, vec2))
        cosine_similarity = max(-1.0, min(1.0, dot / (mag1 * mag2)))
        return 1.0 - cosine_similarity

    def __len__(self):
        return len(self.vectors)

    @property
    def dim(self):
        return self._vector_dim


class BM25Index:
    def __init__(self, k1=1.5, b=0.75):
        self.documents = []
        self._corpus_tokens = []
        self._doc_len = []
        self._doc_freqs = {}
        self._avg_doc_len = 0.0
        self._idf = {}
        self.k1 = k1
        self.b = b

    def _tokenize(self, text):
        return [t for t in re.split(r'\W+', text.lower()) if t]

    def add_documents(self, documents):
        for document in documents:
            doc_tokens = self._tokenize(document['content'])
            self.documents.append(document)
            self._corpus_tokens.append(doc_tokens)
            self._doc_len.append(len(doc_tokens))
            for token in set(doc_tokens):
                self._doc_freqs[token] = self._doc_freqs.get(token, 0) + 1
        self._build_index()

    def _build_index(self):
        if not self.documents:
            return
        self._avg_doc_len = sum(self._doc_len) / len(self.documents)
        n = len(self.documents)
        self._idf = {
            term: math.log(((n - freq + 0.5) / (freq + 0.5)) + 1)
            for term, freq in self._doc_freqs.items()
        }

    def _score(self, query_tokens, doc_index):
        score = 0.0
        doc_term_counts = Counter(self._corpus_tokens[doc_index])
        doc_length = self._doc_len[doc_index]
        for token in query_tokens:
            if token not in self._idf:
                continue
            idf = self._idf[token]
            term_freq = doc_term_counts.get(token, 0)
            numerator = idf * term_freq * (self.k1 + 1)
            denominator = term_freq + self.k1 * (1 - self.b + self.b * (doc_length / self._avg_doc_len))
            score += numerator / (denominator + 1e-9)
        return score

    def search(self, query_text, k=1):
        if not self.documents or self._avg_doc_len == 0:
            return []
        query_tokens = self._tokenize(query_text)
        if not query_tokens:
            return []
        scored = []
        for i in range(len(self.documents)):
            raw_score = self._score(query_tokens, i)
            if raw_score > 1e-9:
                scored.append((raw_score, self.documents[i]))
        scored.sort(key=lambda item: item[0], reverse=True)
        return [(doc, score) for score, doc in scored[:k]]

    def __len__(self):
        return len(self.documents)


class Retriever:
    """Combines a BM25 (keyword) and a vector (semantic) index via reciprocal rank fusion."""

    def __init__(self, bm25_index, vector_index, embed_fn):
        self._bm25_index = bm25_index
        self._vector_index = vector_index
        self._embed_fn = embed_fn

    def search(self, query_text, k=1, k_rrf=60, query_vector=None):
        if query_vector is None:
            query_vector = self._embed_fn([query_text], input_type='query')[0]
        bm25_results = self._bm25_index.search(query_text, k=k * 5)
        vector_results = self._vector_index.search(query_vector, k=k * 5)

        doc_ranks = {}
        for results in (bm25_results, vector_results):
            for rank, (doc, _) in enumerate(results):
                doc_id = id(doc)
                entry = doc_ranks.setdefault(doc_id, {'doc': doc, 'ranks': []})
                entry['ranks'].append(rank + 1)

        scored = [
            (entry['doc'], sum(1.0 / (k_rrf + r) for r in entry['ranks']))
            for entry in doc_ranks.values()
        ]
        scored.sort(key=lambda item: item[1], reverse=True)
        return scored[:k]


_retriever_lock = threading.Lock()
_cached = None  # (vector_index, bm25_index, retriever), built once per process

# Persists the document's embeddings across process restarts (e.g. Flask's debug-mode
# reloader, or a deploy) so a fixed, never-changing sample document doesn't re-embed on
# every restart and eat into Voyage's free-tier rate limit. This caches only the
# document side of the pipeline - every query is still embedded live against Voyage on
# every search, which is the part actually worth watching happen in a RAG demo.
_CACHE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data', 'rag_embedding_cache.json')


def _cache_fingerprint(cache_key):
    # Ties the cache to the exact inputs that determine the resulting vectors - the
    # document text, the chunking parameters, and the embedding model/version (passed
    # in by the caller as cache_key) - so any change to any of them invalidates the
    # cache automatically instead of silently serving stale embeddings.
    h = hashlib.sha256()
    h.update(SAMPLE_DOCUMENT.encode('utf-8'))
    h.update(f'|{CHUNK_SIZE}|{CHUNK_OVERLAP}|{cache_key}'.encode('utf-8'))
    return h.hexdigest()


def _load_cached_vectors(fingerprint, expected_count):
    if not os.path.exists(_CACHE_PATH):
        return None
    try:
        with open(_CACHE_PATH, 'r', encoding='utf-8') as f:
            cached = json.load(f)
    except (OSError, json.JSONDecodeError):
        return None
    if cached.get('fingerprint') != fingerprint:
        return None
    vectors = cached.get('vectors')
    if not isinstance(vectors, list) or len(vectors) != expected_count:
        return None
    return vectors


def _save_cached_vectors(fingerprint, vectors):
    # Best-effort only: persisting the cache is a pure optimization, so a write failure
    # here (read-only filesystem, permissions, full disk) must never fail the request -
    # the caller already has valid, freshly-embedded vectors in memory regardless.
    # Written atomically (temp file + os.replace) so a crash or a second process writing
    # concurrently can never leave readers with a torn/corrupted JSON file.
    try:
        os.makedirs(os.path.dirname(_CACHE_PATH), exist_ok=True)
        tmp_path = f'{_CACHE_PATH}.{os.getpid()}.tmp'
        with open(tmp_path, 'w', encoding='utf-8') as f:
            json.dump({'fingerprint': fingerprint, 'vectors': vectors}, f)
        os.replace(tmp_path, _CACHE_PATH)
    except OSError:
        pass


def get_retriever(embed_fn, cache_key=''):
    global _cached
    if _cached is not None:
        return _cached
    with _retriever_lock:
        if _cached is None:
            documents = [{'content': c} for c in chunk_by_char(SAMPLE_DOCUMENT)]
            vector_index = VectorIndex(embedding_fn=embed_fn)
            bm25_index = BM25Index()
            bm25_index.add_documents(documents)  # local computation only, no API call

            fingerprint = _cache_fingerprint(cache_key)
            cached_vectors = _load_cached_vectors(fingerprint, len(documents))
            if cached_vectors is not None:
                for vector, document in zip(cached_vectors, documents):
                    vector_index.add_vector(vector, document)
            else:
                vector_index.add_documents(documents)
                _save_cached_vectors(fingerprint, vector_index.vectors)

            retriever = Retriever(bm25_index, vector_index, embed_fn)
            _cached = (vector_index, bm25_index, retriever)
    return _cached
